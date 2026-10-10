import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { getApp, getApps, initializeApp, type AppOptions } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

declare module 'fastify' {
  interface FastifyRequest {
    identity: DecodedIdToken | null;
  }
}

const isProduction = process.env.NODE_ENV === 'production';
const projectId = process.env.FIREBASE_PROJECT_ID ?? (isProduction ? undefined : 'demo-dollareus');
if (!projectId) {
  throw new Error('FIREBASE_PROJECT_ID must be configured in production.');
}

const firebaseOptions: AppOptions = { projectId };
if (process.env.FIREBASE_STORAGE_BUCKET) {
  firebaseOptions.storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
}
if (getApps().length === 0) initializeApp(firebaseOptions);

const db = getFirestore(getApp());
const app = Fastify({
  logger: true,
  trustProxy: isProduction,
  bodyLimit: 1_048_576,
  genReqId: () => randomUUID()
});

app.decorateRequest('identity', null);

const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:4200')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, { origin: allowedOrigins, credentials: true });
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

app.setErrorHandler((error, request, reply) => {
  const normalizedError = error instanceof Error ? error : new Error('Unknown request error');
  request.log.error({ err: normalizedError }, 'Request failed');
  const candidateStatus = typeof error === 'object' && error !== null && 'statusCode' in error
    ? error.statusCode
    : undefined;
  const statusCode = typeof candidateStatus === 'number' && candidateStatus >= 400 && candidateStatus < 600
    ? candidateStatus
    : 500;
  return reply.code(statusCode).send({
    error: {
      code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
      message: statusCode >= 500 ? 'An unexpected error occurred.' : normalizedError.message,
      requestId: request.id
    }
  });
});

async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    await reply.code(401).send({ error: { code: 'AUTH_REQUIRED', message: 'A valid bearer token is required.', requestId: request.id } });
    return;
  }

  try {
    request.identity = await getAuth().verifyIdToken(authorization.slice(7), true);
  } catch {
    await reply.code(401).send({ error: { code: 'INVALID_TOKEN', message: 'The session token is invalid or expired.', requestId: request.id } });
  }
}

async function requireOrganizationMembership(
  request: FastifyRequest,
  reply: FastifyReply,
  organizationId: string
): Promise<boolean> {
  if (!request.identity) {
    await reply.code(401).send({ error: { code: 'AUTH_REQUIRED', message: 'Authentication is required.', requestId: request.id } });
    return false;
  }

  const membership = await db.doc(`organizations/${organizationId}/members/${request.identity.uid}`).get();
  if (!membership.exists || membership.data()?.status !== 'active') {
    await reply.code(403).send({ error: { code: 'ORGANIZATION_ACCESS_DENIED', message: 'You do not have access to this organization.', requestId: request.id } });
    return false;
  }
  return true;
}

const StoreBusinessTypeSchema = z.enum(['retail', 'restaurant', 'freelancer', 'services', 'digital', 'general']);
const StoreExperienceSchema = z.enum(['commerce', 'menu', 'catalog', 'services']);
const CreateStoreSchema = z.object({
  name: z.string().trim().min(1).max(180),
  slug: z.string().min(1).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  businessType: StoreBusinessTypeSchema,
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/).default('MAD'),
  locale: z.enum(['en', 'fr', 'ar']).default('en'),
  timeZone: z.string().min(1).max(100).default('Africa/Casablanca'),
  defaultExperience: StoreExperienceSchema.optional(),
  enabledExperiences: z.array(StoreExperienceSchema).min(1).optional()
}).strict().superRefine((value, context) => {
  const inferredExperience = value.businessType === 'restaurant' ? 'menu'
    : value.businessType === 'services' || value.businessType === 'freelancer' ? 'services'
    : 'commerce';
  const enabled = value.enabledExperiences ?? [value.defaultExperience ?? inferredExperience];
  const defaultExperience = value.defaultExperience ?? inferredExperience;
  if (!enabled.includes(defaultExperience)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['enabledExperiences'], message: 'The default experience must be enabled.' });
  }
});
const UpdateStorefrontSchema = z.object({
  defaultExperience: StoreExperienceSchema,
  enabledExperiences: z.array(StoreExperienceSchema).min(1),
  published: z.boolean()
}).strict().refine((value) => value.enabledExperiences.includes(value.defaultExperience), {
  message: 'The default experience must be enabled.',
  path: ['enabledExperiences']
});
const CreateEntryPointSchema = z.object({
  type: z.enum(['direct-link', 'qr', 'embed']),
  targetPath: z.enum(['/', '/menu', '/catalog', '/services']).default('/')
}).strict();
const UpdateEntryPointSchema = z.object({ status: z.enum(['active', 'disabled']) }).strict();
const CreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(2000).optional(),
  position: z.number().int().nonnegative().default(0),
  status: z.enum(['draft', 'active', 'archived']).default('active')
}).strict();

const MoneySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/)
}).strict();

const VariantSchema = z.object({
  id: z.string().min(1).max(100),
  sku: z.string().max(100).optional(),
  title: z.string().min(1).max(180),
  options: z.record(z.string()).default({}),
  price: MoneySchema,
  status: z.enum(['draft', 'active', 'archived']).default('draft')
}).strict();

const ImageSchema = z.object({
  id: z.string().min(1).max(100),
  storageKey: z.string().min(1).max(1024),
  alt: z.string().max(500),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  position: z.number().int().nonnegative()
}).strict();

const CreateProductSchema = z.object({
  storeId: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(180),
  description: z.string().max(10000).optional(),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  kind: z.enum(['physical', 'digital', 'service', 'food']),
  categoryIds: z.array(z.string().min(1).max(100)).max(100).default([]),
  availability: z.object({ status: z.enum(['available', 'unavailable', 'limited', 'preorder']), note: z.string().max(500).optional() }).strict().optional(),
  attributes: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(),
  images: z.array(ImageSchema).max(0).default([]),
  variants: z.array(VariantSchema).min(1).max(100)
}).strict();

const UpdateProductSchema = z.object({
  storeId: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  name: z.string().trim().min(1).max(180).optional(),
  description: z.string().max(10000).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  kind: z.enum(['physical', 'digital', 'service', 'food']).optional(),
  categoryIds: z.array(z.string().min(1).max(100)).max(100).optional(),
  availability: z.object({ status: z.enum(['available', 'unavailable', 'limited', 'preorder']), note: z.string().max(500).optional() }).strict().optional(),
  attributes: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(),
  variants: z.array(VariantSchema).min(1).max(100).optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one product field to update.'
});

const UploadIntentSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
}).strict();

app.get('/health', async () => ({
  status: 'ok',
  service: 'dollareus-api',
  version: '0.1.0'
}));

app.get('/api/v1/health', async (request) => ({
  data: { status: 'ok', service: 'dollareus-api', version: '0.1.0' },
  requestId: request.id
}));

app.get<{ Params: { organizationId: string }; Querystring: { limit?: string } }>(
  '/api/v1/organizations/:organizationId/products',
  { preHandler: authenticate },
  async (request, reply) => {
    const { organizationId } = request.params;
    if (!await requireOrganizationMembership(request, reply, organizationId)) return;

    const requestedLimit = Number.parseInt(request.query.limit ?? '50', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 50;
    const snapshot = await db.collection(`organizations/${organizationId}/products`)
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();

    return {
      data: snapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
      requestId: request.id
    };
  }
);

app.post<{ Params: { organizationId: string }; Body: unknown }>(
  '/api/v1/organizations/:organizationId/products',
  { preHandler: authenticate },
  async (request, reply) => {
    const { organizationId } = request.params;
    if (!await requireOrganizationMembership(request, reply, organizationId)) return;

    const parsed = CreateProductSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The product payload is invalid.',
          details: parsed.error.flatten(),
          requestId: request.id
        }
      });
    }

    if (parsed.data.storeId) {
      const storeSnapshot = await db.doc(`organizations/${organizationId}/stores/${parsed.data.storeId}`).get();
      if (!storeSnapshot.exists) {
        return reply.code(404).send({ error: { code: 'STORE_NOT_FOUND', message: 'The selected store does not exist in this organization.', requestId: request.id } });
      }
    }

    const collection = db.collection(`organizations/${organizationId}/products`);
    const productRef = collection.doc();
    const slugRef = db.doc(`organizations/${organizationId}/productSlugs/${parsed.data.slug}`);
    const now = new Date().toISOString();
    const product = {
      ...parsed.data,
      id: productRef.id,
      organizationId,
      createdAt: now,
      updatedAt: now
    };

    try {
      await db.runTransaction(async (transaction) => {
        const slugDocument = await transaction.get(slugRef);
        if (slugDocument.exists) throw new Error('PRODUCT_SLUG_TAKEN');
        transaction.create(productRef, product);
        transaction.create(slugRef, { productId: productRef.id, createdAt: now });
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'PRODUCT_SLUG_TAKEN') {
        return reply.code(409).send({
          error: { code: 'PRODUCT_SLUG_TAKEN', message: 'A product with this slug already exists.', requestId: request.id }
        });
      }
      throw error;
    }

    return reply.code(201).send({ data: product, requestId: request.id });
  }
);

app.patch<{ Params: { organizationId: string; productId: string }; Body: unknown }>(
  '/api/v1/organizations/:organizationId/products/:productId',
  { preHandler: authenticate },
  async (request, reply) => {
    const { organizationId, productId } = request.params;
    if (!await requireOrganizationMembership(request, reply, organizationId)) return;

    const parsed = UpdateProductSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The product update payload is invalid.',
          details: parsed.error.flatten(),
          requestId: request.id
        }
      });
    }

    if (parsed.data.storeId) {
      const storeSnapshot = await db.doc(`organizations/${organizationId}/stores/${parsed.data.storeId}`).get();
      if (!storeSnapshot.exists) {
        return reply.code(404).send({ error: { code: 'STORE_NOT_FOUND', message: 'The selected store does not exist in this organization.', requestId: request.id } });
      }
    }

    const productRef = db.doc(`organizations/${organizationId}/products/${productId}`);
    const requestedSlug = parsed.data.slug;
    const requestedSlugRef = requestedSlug
      ? db.doc(`organizations/${organizationId}/productSlugs/${requestedSlug}`)
      : null;
    const now = new Date().toISOString();

    try {
      const product = await db.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(productRef);
        if (!currentSnapshot.exists) throw new Error('PRODUCT_NOT_FOUND');

        const current = currentSnapshot.data()!;
        const currentSlug = String(current.slug ?? '');
        const slugChanged = Boolean(requestedSlug && requestedSlug !== currentSlug);
        const requestedSlugSnapshot = slugChanged && requestedSlugRef
          ? await transaction.get(requestedSlugRef)
          : null;

        if (slugChanged && requestedSlugSnapshot?.exists) {
          throw new Error('PRODUCT_SLUG_TAKEN');
        }

        const changes = { ...parsed.data, updatedAt: now };
        transaction.update(productRef, changes);

        if (slugChanged && requestedSlugRef) {
          const oldSlugRef = db.doc(`organizations/${organizationId}/productSlugs/${currentSlug}`);
          transaction.delete(oldSlugRef);
          transaction.create(requestedSlugRef, { productId, createdAt: now });
        }

        return { ...current, ...changes, id: productId, organizationId };
      });

      return { data: product, requestId: request.id };
    } catch (error) {
      if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') {
        return reply.code(404).send({
          error: { code: 'PRODUCT_NOT_FOUND', message: 'The product does not exist.', requestId: request.id }
        });
      }
      if (error instanceof Error && error.message === 'PRODUCT_SLUG_TAKEN') {
        return reply.code(409).send({
          error: { code: 'PRODUCT_SLUG_TAKEN', message: 'A product with this slug already exists.', requestId: request.id }
        });
      }
      throw error;
    }
  }
);

app.post<{ Params: { organizationId: string; productId: string }; Body: unknown }>(
  '/api/v1/organizations/:organizationId/products/:productId/media/upload-intents',
  { preHandler: authenticate },
  async (request, reply) => {
    const { organizationId, productId } = request.params;
    if (!await requireOrganizationMembership(request, reply, organizationId)) return;

    const parsed = UploadIntentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_MEDIA_TYPE', message: 'Choose a supported image format: JPEG, PNG, WebP, or AVIF.', requestId: request.id }
      });
    }

    const product = await db.doc(`organizations/${organizationId}/products/${productId}`).get();
    if (!product.exists) {
      return reply.code(404).send({ error: { code: 'PRODUCT_NOT_FOUND', message: 'The product does not exist.', requestId: request.id } });
    }

    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    if (!bucketName) {
      return reply.code(503).send({ error: { code: 'MEDIA_STORAGE_NOT_CONFIGURED', message: 'Product media storage has not been configured.', requestId: request.id } });
    }

    const extensionByType: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/avif': 'avif'
    };
    const assetId = randomUUID();
    const storageKey = `organizations/${organizationId}/products/${productId}/${assetId}/original.${extensionByType[parsed.data.contentType]}`;
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const [uploadPolicy] = await getStorage().bucket(bucketName).file(storageKey).generateSignedPostPolicyV4({
      expires: new Date(expiresAt),
      fields: {
        key: storageKey,
        'Content-Type': parsed.data.contentType
      },
      conditions: [
        ['content-length-range', '1', String(10 * 1024 * 1024)],
        ['eq', '$Content-Type', parsed.data.contentType],
        ['eq', '$key', storageKey]
      ]
    });

    const mediaRef = db.doc(`organizations/${organizationId}/products/${productId}/mediaAssets/${assetId}`);
    await mediaRef.create({
      assetId,
      storageKey,
      contentType: parsed.data.contentType,
      status: 'pending',
      createdBy: request.identity?.uid,
      expiresAt: new Date(expiresAt).toISOString(),
      createdAt: new Date().toISOString()
    });

    return reply.code(201).send({
      data: {
        assetId,
        storageKey,
        uploadUrl: uploadPolicy.url,
        uploadMethod: 'POST',
        uploadFields: uploadPolicy.fields,
        contentType: parsed.data.contentType,
        maxFileSizeBytes: 10 * 1024 * 1024,
        expiresAt: new Date(expiresAt).toISOString()
      },
      requestId: request.id
    });
  }
);

const CompleteUploadSchema = z.object({
  alt: z.string().max(500).default(''),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  position: z.number().int().nonnegative().default(0)
}).strict();

app.post<{ Params: { organizationId: string; productId: string; assetId: string }; Body: unknown }>(
  '/api/v1/organizations/:organizationId/products/:productId/media/:assetId/complete',
  { preHandler: authenticate },
  async (request, reply) => {
    const { organizationId, productId, assetId } = request.params;
    if (!await requireOrganizationMembership(request, reply, organizationId)) return;

    const parsed = CompleteUploadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_MEDIA_METADATA', message: 'The image metadata is invalid.', requestId: request.id }
      });
    }

    const productRef = db.doc(`organizations/${organizationId}/products/${productId}`);
    const mediaRef = db.doc(`organizations/${organizationId}/products/${productId}/mediaAssets/${assetId}`);
    const [productSnapshot, mediaSnapshot] = await Promise.all([productRef.get(), mediaRef.get()]);
    if (!productSnapshot.exists) {
      return reply.code(404).send({ error: { code: 'PRODUCT_NOT_FOUND', message: 'The product does not exist.', requestId: request.id } });
    }
    if (!mediaSnapshot.exists || mediaSnapshot.data()?.createdBy !== request.identity?.uid) {
      return reply.code(404).send({ error: { code: 'MEDIA_UPLOAD_NOT_FOUND', message: 'The pending upload was not found.', requestId: request.id } });
    }

    const pending = mediaSnapshot.data();
    if (pending?.status !== 'pending') {
      return reply.code(409).send({ error: { code: 'MEDIA_UPLOAD_ALREADY_COMPLETED', message: 'This upload is no longer pending.', requestId: request.id } });
    }
    if (Date.parse(String(pending.expiresAt)) < Date.now()) {
      return reply.code(410).send({ error: { code: 'MEDIA_UPLOAD_EXPIRED', message: 'The upload authorization has expired.', requestId: request.id } });
    }

    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    if (!bucketName) {
      return reply.code(503).send({ error: { code: 'MEDIA_STORAGE_NOT_CONFIGURED', message: 'Product media storage has not been configured.', requestId: request.id } });
    }

    const file = getStorage().bucket(bucketName).file(String(pending.storageKey));
    let metadata: { contentType?: string; size?: string | number };
    try {
      [metadata] = await file.getMetadata();
    } catch {
      return reply.code(409).send({ error: { code: 'MEDIA_UPLOAD_NOT_FOUND', message: 'The image has not been uploaded yet.', requestId: request.id } });
    }
    const sizeBytes = Number(metadata.size ?? 0);
    if (metadata.contentType !== pending.contentType || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return reply.code(400).send({ error: { code: 'MEDIA_FILE_INVALID', message: 'The uploaded file does not match the authorized image type.', requestId: request.id } });
    }
    if (sizeBytes > 10 * 1024 * 1024) {
      await file.delete({ ignoreNotFound: true }).catch(() => undefined);
      return reply.code(413).send({ error: { code: 'MEDIA_FILE_TOO_LARGE', message: 'Images must be 10 MB or smaller.', requestId: request.id } });
    }

    const image = {
      id: assetId,
      storageKey: String(pending.storageKey),
      alt: parsed.data.alt,
      ...(parsed.data.width ? { width: parsed.data.width } : {}),
      ...(parsed.data.height ? { height: parsed.data.height } : {}),
      position: parsed.data.position
    };
    const updatedAt = new Date().toISOString();

    await db.runTransaction(async (transaction) => {
      const currentProduct = await transaction.get(productRef);
      const currentMedia = await transaction.get(mediaRef);
      if (!currentProduct.exists || !currentMedia.exists || currentMedia.data()?.status !== 'pending') {
        throw new Error('MEDIA_STATE_CHANGED');
      }
      const existingImages = (currentProduct.data()?.images ?? []) as typeof image[];
      transaction.update(productRef, { images: [...existingImages, image], updatedAt });
      transaction.update(mediaRef, { status: 'complete', completedAt: updatedAt, sizeBytes });
    });

    return reply.code(201).send({ data: image, requestId: request.id });
  }
);


/**
 * Stores and public experiences share the same catalog records. A menu is a
 * rendering mode, not a separate store or a second catalog.
 */
app.post<{ Params: { organizationId: string }; Body: unknown }>(
  '/api/v1/organizations/:organizationId/stores',
  { preHandler: authenticate },
  async (request, reply) => {
    const { organizationId } = request.params;
    if (!await requireOrganizationMembership(request, reply, organizationId)) return;
    const parsed = CreateStoreSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'The store payload is invalid.', details: parsed.error.flatten(), requestId: request.id }
      });
    }

    const collection = db.collection(`organizations/${organizationId}/stores`);
    const storeRef = collection.doc();
    const slugRef = db.doc(`organizations/${organizationId}/storeSlugs/${parsed.data.slug}`);
    const publicSlugRef = db.doc(`publicStoreSlugs/${parsed.data.slug}`);
    const inferredExperience = parsed.data.businessType === 'restaurant' ? 'menu'
      : parsed.data.businessType === 'services' || parsed.data.businessType === 'freelancer' ? 'services'
      : 'commerce';
    const defaultExperience = parsed.data.defaultExperience ?? inferredExperience;
    const enabledExperiences = parsed.data.enabledExperiences ?? [defaultExperience];
    const now = new Date().toISOString();
    const store = {
      id: storeRef.id,
      organizationId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      businessType: parsed.data.businessType,
      defaultCurrency: parsed.data.defaultCurrency,
      locale: parsed.data.locale,
      timeZone: parsed.data.timeZone,
      status: 'setup',
      defaultExperience,
      enabledExperiences,
      published: false,
      createdAt: now,
      updatedAt: now
    };

    try {
      await db.runTransaction(async (transaction) => {
        const [existingSlug, existingPublicSlug] = await Promise.all([transaction.get(slugRef), transaction.get(publicSlugRef)]);
        if (existingSlug.exists || existingPublicSlug.exists) throw new Error('STORE_SLUG_TAKEN');
        transaction.create(storeRef, store);
        transaction.create(slugRef, { organizationId, storeId: storeRef.id, slug: parsed.data.slug, createdAt: now });
        transaction.create(publicSlugRef, { organizationId, storeId: storeRef.id, slug: parsed.data.slug, createdAt: now });
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'STORE_SLUG_TAKEN') {
        return reply.code(409).send({ error: { code: 'STORE_SLUG_TAKEN', message: 'A store with this slug already exists.', requestId: request.id } });
      }
      throw error;
    }
    return reply.code(201).send({ data: store, requestId: request.id });
  }
);

app.get<{ Params: { organizationId: string } }>(
  '/api/v1/organizations/:organizationId/stores',
  { preHandler: authenticate },
  async (request, reply) => {
    const { organizationId } = request.params;
    if (!await requireOrganizationMembership(request, reply, organizationId)) return;
    const snapshot = await db.collection(`organizations/${organizationId}/stores`).orderBy('updatedAt', 'desc').limit(100).get();
    return { data: snapshot.docs.map((document) => ({ id: document.id, ...document.data() })), requestId: request.id };
  }
);

app.patch<{ Params: { organizationId: string; storeId: string }; Body: unknown }>(
  '/api/v1/organizations/:organizationId/stores/:storeId/storefront',
  { preHandler: authenticate },
  async (request, reply) => {
    const { organizationId, storeId } = request.params;
    if (!await requireOrganizationMembership(request, reply, organizationId)) return;
    const parsed = UpdateStorefrontSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'The storefront configuration is invalid.', details: parsed.error.flatten(), requestId: request.id } });
    }
    const storeRef = db.doc(`organizations/${organizationId}/stores/${storeId}`);
    const storeSnapshot = await storeRef.get();
    if (!storeSnapshot.exists) {
      return reply.code(404).send({ error: { code: 'STORE_NOT_FOUND', message: 'The store does not exist.', requestId: request.id } });
    }
    const now = new Date().toISOString();
    const updated = {
      ...parsed.data,
      published: parsed.data.published,
      status: parsed.data.published ? 'active' : (storeSnapshot.data()?.status === 'active' ? 'setup' : storeSnapshot.data()?.status ?? 'setup'),
      updatedAt: now
    };
    await storeRef.update(updated);
    return { data: { ...storeSnapshot.data(), ...updated, id: storeId, organizationId }, requestId: request.id };
  }
);

app.post<{ Params: { organizationId: string; storeId: string }; Body: unknown }>(
  '/api/v1/organizations/:organizationId/stores/:storeId/categories',
  { preHandler: authenticate },
  async (request, reply) => {
    const { organizationId, storeId } = request.params;
    if (!await requireOrganizationMembership(request, reply, organizationId)) return;
    const parsed = CreateCategorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'The category payload is invalid.', details: parsed.error.flatten(), requestId: request.id } });
    }
    const storeRef = db.doc(`organizations/${organizationId}/stores/${storeId}`);
    const storeSnapshot = await storeRef.get();
    if (!storeSnapshot.exists) {
      return reply.code(404).send({ error: { code: 'STORE_NOT_FOUND', message: 'The store does not exist.', requestId: request.id } });
    }
    const categoryRef = storeRef.collection('categories').doc();
    const categorySlugRef = storeRef.collection('categorySlugs').doc(parsed.data.slug);
    const now = new Date().toISOString();
    const category = { ...parsed.data, id: categoryRef.id, organizationId, storeId, createdAt: now, updatedAt: now };
    try {
      await db.runTransaction(async (transaction) => {
        const slugSnapshot = await transaction.get(categorySlugRef);
        if (slugSnapshot.exists) throw new Error('CATEGORY_SLUG_TAKEN');
        transaction.create(categoryRef, category);
        transaction.create(categorySlugRef, { categoryId: categoryRef.id, createdAt: now });
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'CATEGORY_SLUG_TAKEN') {
        return reply.code(409).send({ error: { code: 'CATEGORY_SLUG_TAKEN', message: 'A category with this slug already exists in this store.', requestId: request.id } });
      }
      throw error;
    }
    return reply.code(201).send({ data: category, requestId: request.id });
  }
);


app.get<{ Params: { organizationId: string; storeId: string } }>(
  '/api/v1/organizations/:organizationId/stores/:storeId/entry-points',
  { preHandler: authenticate },
  async (request, reply) => {
    const { organizationId, storeId } = request.params;
    if (!await requireOrganizationMembership(request, reply, organizationId)) return;
    const storeRef = db.doc(`organizations/${organizationId}/stores/${storeId}`);
    const storeSnapshot = await storeRef.get();
    if (!storeSnapshot.exists) {
      return reply.code(404).send({ error: { code: 'STORE_NOT_FOUND', message: 'The store does not exist.', requestId: request.id } });
    }
    const snapshot = await storeRef.collection('entryPoints').orderBy('createdAt', 'desc').limit(100).get();
    return { data: snapshot.docs.map((document) => ({ id: document.id, ...document.data(), publicPath: `/q/${document.id}` })), requestId: request.id };
  }
);

app.post<{ Params: { organizationId: string; storeId: string }; Body: unknown }>(
  '/api/v1/organizations/:organizationId/stores/:storeId/entry-points',
  { preHandler: authenticate },
  async (request, reply) => {
    const { organizationId, storeId } = request.params;
    if (!await requireOrganizationMembership(request, reply, organizationId)) return;
    const parsed = CreateEntryPointSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'The entry-point payload is invalid.', details: parsed.error.flatten(), requestId: request.id } });
    }
    const storeRef = db.doc(`organizations/${organizationId}/stores/${storeId}`);
    const storeSnapshot = await storeRef.get();
    if (!storeSnapshot.exists) {
      return reply.code(404).send({ error: { code: 'STORE_NOT_FOUND', message: 'The store does not exist.', requestId: request.id } });
    }
    const store = storeSnapshot.data()!;
    const experienceForPath: Record<string, string> = { '/': String(store.defaultExperience ?? 'commerce'), '/menu': 'menu', '/catalog': 'catalog', '/services': 'services' };
    const experience = experienceForPath[parsed.data.targetPath];
    const enabledExperiences = (store.enabledExperiences ?? []) as string[];
    if (!enabledExperiences.includes(experience)) {
      return reply.code(400).send({ error: { code: 'EXPERIENCE_NOT_ENABLED', message: 'Enable this storefront experience before creating an entry point for it.', requestId: request.id } });
    }
    const entryPointRef = storeRef.collection('entryPoints').doc();
    const globalRef = db.doc(`publicEntryPoints/${entryPointRef.id}`);
    const now = new Date().toISOString();
    const entryPoint = {
      id: entryPointRef.id,
      storeId,
      organizationId,
      type: parsed.data.type,
      targetPath: parsed.data.targetPath,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    await db.runTransaction(async (transaction) => {
      transaction.create(entryPointRef, entryPoint);
      transaction.create(globalRef, { organizationId, storeId, entryPointId: entryPointRef.id, createdAt: now });
    });
    return reply.code(201).send({
      data: { ...entryPoint, publicPath: `/q/${entryPointRef.id}`, targetExperience: experience },
      requestId: request.id
    });
  }
);

app.patch<{ Params: { organizationId: string; storeId: string; entryPointId: string }; Body: unknown }>(
  '/api/v1/organizations/:organizationId/stores/:storeId/entry-points/:entryPointId',
  { preHandler: authenticate },
  async (request, reply) => {
    const { organizationId, storeId, entryPointId } = request.params;
    if (!await requireOrganizationMembership(request, reply, organizationId)) return;
    const parsed = UpdateEntryPointSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'The entry-point update is invalid.', requestId: request.id } });
    }
    const entryRef = db.doc(`organizations/${organizationId}/stores/${storeId}/entryPoints/${entryPointId}`);
    const snapshot = await entryRef.get();
    if (!snapshot.exists) {
      return reply.code(404).send({ error: { code: 'ENTRY_POINT_NOT_FOUND', message: 'The entry point does not exist.', requestId: request.id } });
    }
    const updatedAt = new Date().toISOString();
    await entryRef.update({ status: parsed.data.status, updatedAt });
    return { data: { ...snapshot.data(), ...parsed.data, updatedAt, publicPath: `/q/${entryPointId}` }, requestId: request.id };
  }
);

app.get<{ Params: { entryPointId: string } }>(
  '/api/v1/public/entry-points/:entryPointId',
  async (request, reply) => {
    const globalSnapshot = await db.doc(`publicEntryPoints/${request.params.entryPointId}`).get();
    if (!globalSnapshot.exists) {
      return reply.code(404).send({ error: { code: 'ENTRY_POINT_NOT_FOUND', message: 'This public link is not available.', requestId: request.id } });
    }
    const index = globalSnapshot.data()!;
    const entrySnapshot = await db.doc(`organizations/${index.organizationId}/stores/${index.storeId}/entryPoints/${index.entryPointId}`).get();
    const storeSnapshot = await db.doc(`organizations/${index.organizationId}/stores/${index.storeId}`).get();
    if (!entrySnapshot.exists || !storeSnapshot.exists || entrySnapshot.data()?.status !== 'active' || storeSnapshot.data()?.published !== true || storeSnapshot.data()?.status !== 'active') {
      return reply.code(404).send({ error: { code: 'ENTRY_POINT_NOT_FOUND', message: 'This public link is not available.', requestId: request.id } });
    }
    const entryPoint = entrySnapshot.data()!;
    const store = storeSnapshot.data()!;
    const experienceForPath: Record<string, string> = { '/': String(store.defaultExperience ?? 'commerce'), '/menu': 'menu', '/catalog': 'catalog', '/services': 'services' };
    return {
      data: {
        storeSlug: store.slug,
        storeName: store.name,
        targetPath: entryPoint.targetPath,
        experience: experienceForPath[String(entryPoint.targetPath)] ?? store.defaultExperience,
        canonicalPath: `/s/${store.slug}${entryPoint.targetPath === '/' ? '' : entryPoint.targetPath}`
      },
      requestId: request.id
    };
  }
);

async function resolvePublicStore(storeSlug: string) {
  const slugSnapshot = await db.doc(`publicStoreSlugs/${storeSlug}`).get();
  if (!slugSnapshot.exists) return null;
  const slugData = slugSnapshot.data()!;
  if (typeof slugData.organizationId !== 'string' || typeof slugData.storeId !== 'string') return null;
  const storeSnapshot = await db.doc(`organizations/${slugData.organizationId}/stores/${slugData.storeId}`).get();
  if (!storeSnapshot.exists) return null;
  const store = storeSnapshot.data()!;
  if (store.published !== true || store.status !== 'active') return null;
  return { organizationId: slugData.organizationId, storeId: slugData.storeId, store };
}

app.get<{ Params: { storeSlug: string } }>(
  '/api/v1/public/stores/:storeSlug',
  async (request, reply) => {
    const resolved = await resolvePublicStore(request.params.storeSlug);
    if (!resolved) {
      return reply.code(404).send({ error: { code: 'PUBLIC_STORE_NOT_FOUND', message: 'This public store is not available.', requestId: request.id } });
    }
    const store = resolved.store;
    return {
      data: {
        id: resolved.storeId,
        name: store.name,
        slug: store.slug,
        businessType: store.businessType,
        defaultCurrency: store.defaultCurrency,
        locale: store.locale,
        timeZone: store.timeZone,
        defaultExperience: store.defaultExperience,
        enabledExperiences: store.enabledExperiences,
        updatedAt: store.updatedAt
      },
      requestId: request.id
    };
  }
);

app.get<{ Params: { storeSlug: string }; Querystring: { limit?: string; cursor?: string } }>(
  '/api/v1/public/stores/:storeSlug/catalog',
  async (request, reply) => {
    const resolved = await resolvePublicStore(request.params.storeSlug);
    if (!resolved) {
      return reply.code(404).send({ error: { code: 'PUBLIC_STORE_NOT_FOUND', message: 'This public store is not available.', requestId: request.id } });
    }
    const requestedLimit = Number.parseInt(request.query.limit ?? '50', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 50;
    let productsQuery = db.collection(`organizations/${resolved.organizationId}/products`)
      .where('storeId', '==', resolved.storeId)
      .where('status', '==', 'active')
      .orderBy('updatedAt', 'desc')
      .limit(limit + 1);
    if (request.query.cursor) {
      const cursorSnapshot = await db.doc(`organizations/${resolved.organizationId}/products/${request.query.cursor}`).get();
      if (cursorSnapshot.exists && cursorSnapshot.data()?.storeId === resolved.storeId) productsQuery = productsQuery.startAfter(cursorSnapshot);
    }
    const productSnapshot = await productsQuery.get();
    const hasMore = productSnapshot.docs.length > limit;
    const visibleDocs = productSnapshot.docs.slice(0, limit);
    const categoriesSnapshot = await db.doc(`organizations/${resolved.organizationId}/stores/${resolved.storeId}`).collection('categories')
      .where('status', '==', 'active').orderBy('position', 'asc').limit(100).get();
    const items = visibleDocs.map((document) => {
      const value = document.data();
      return {
        id: document.id,
        slug: value.slug,
        name: value.name,
        status: 'active',
        description: value.description,
        kind: value.kind,
        categoryIds: value.categoryIds ?? [],
        images: ((value.images ?? []) as Array<{ id: string; alt?: string; width?: number; height?: number; position: number }>).map((image) => ({ id: image.id, alt: image.alt ?? '', ...(image.width ? { width: image.width } : {}), ...(image.height ? { height: image.height } : {}), position: image.position })),
        variants: (value.variants ?? []).filter((variant: { status?: string }) => variant.status === 'active'),
        availability: value.availability ?? { status: 'available' },
        attributes: value.attributes ?? {},
        updatedAt: value.updatedAt
      };
    }).filter((item) => item.variants.length > 0);
    return {
      data: {
        store: {
          id: resolved.storeId,
          name: resolved.store.name,
          slug: resolved.store.slug,
          businessType: resolved.store.businessType,
          defaultCurrency: resolved.store.defaultCurrency,
          locale: resolved.store.locale,
          timeZone: resolved.store.timeZone,
          defaultExperience: resolved.store.defaultExperience,
          enabledExperiences: resolved.store.enabledExperiences
        },
        categories: categoriesSnapshot.docs.map((document) => {
          const category = document.data();
          return { id: document.id, name: category.name, slug: category.slug, description: category.description, position: category.position };
        }),
        items,
        nextCursor: hasMore ? visibleDocs[visibleDocs.length - 1]?.id : undefined
      },
      requestId: request.id
    };
  }
);

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
