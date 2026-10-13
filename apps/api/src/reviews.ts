import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pool } from './db/pool.js';
import { authPublicUrl, sendAuthEmail } from './auth.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const normalizeEmail = (value: string) => value.trim().toLowerCase();

function fail(reply: any, request: any, statusCode: number, code: string, message: string) {
  return reply.code(statusCode).send({ error: { code, message, requestId: request.id }, requestId: request.id });
}

export async function registerReviewRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { storeHandle: string; locationSlug: string } }>('/api/v1/public/storefronts/:storeHandle/:locationSlug/reviews', async (request, reply) => {
    const store = await pool.query(
      "SELECT s.id FROM stores s JOIN store_frontends f ON f.store_id=s.id AND f.organization_id=s.organization_id WHERE s.public_handle=$1 AND s.location_slug=$2 AND s.status='active' AND f.published=true LIMIT 1",
      [request.params.storeHandle, request.params.locationSlug]
    );
    if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The published store does not exist.');
    const storeId = store.rows[0].id;
    const [summary, distribution, reviews] = await Promise.all([
      pool.query("SELECT COALESCE(AVG(rating),0)::numeric(3,2) AS average_rating, COUNT(*)::int AS review_count FROM store_reviews WHERE store_id=$1 AND status='published' AND email_verified_at IS NOT NULL", [storeId]),
      pool.query("SELECT rating,COUNT(*)::int AS count FROM store_reviews WHERE store_id=$1 AND status='published' AND email_verified_at IS NOT NULL GROUP BY rating ORDER BY rating DESC", [storeId]),
      pool.query("SELECT id,rating,review_text,created_at,published_at FROM store_reviews WHERE store_id=$1 AND status='published' AND email_verified_at IS NOT NULL ORDER BY published_at DESC LIMIT 30", [storeId])
    ]);
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of distribution.rows) counts[Number(row.rating)] = Number(row.count);
    return {
      data: {
        averageRating: Number(summary.rows[0]?.average_rating ?? 0),
        reviewCount: Number(summary.rows[0]?.review_count ?? 0),
        ratingDistribution: counts,
        reviews: reviews.rows.map((row) => ({
          id: row.id,
          rating: Number(row.rating),
          reviewText: row.review_text,
          createdAt: row.created_at,
          publishedAt: row.published_at
        }))
      },
      requestId: request.id
    };
  });

  app.post<{ Params: { storeHandle: string; locationSlug: string }; Body: { email?: unknown; rating?: unknown; reviewText?: unknown } }>(
    '/api/v1/public/storefronts/:storeHandle/:locationSlug/reviews',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const email = typeof request.body?.email === 'string' ? normalizeEmail(request.body.email) : '';
      const rating = request.body?.rating;
      const reviewText = typeof request.body?.reviewText === 'string' ? request.body.reviewText.trim() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return fail(reply, request, 400, 'INVALID_REVIEW_EMAIL', 'Enter a valid email address.');
      }
      if (!Number.isInteger(rating) || Number(rating) < 1 || Number(rating) > 5) {
        return fail(reply, request, 400, 'INVALID_REVIEW_RATING', 'Choose between one and five hearts.');
      }
      if (reviewText.length < 3 || reviewText.length > 5000) {
        return fail(reply, request, 400, 'INVALID_REVIEW_TEXT', 'Write between 3 and 5,000 characters.');
      }
      const store = await pool.query(
        "SELECT s.id,s.name,s.public_handle,s.location_slug FROM stores s JOIN store_frontends f ON f.store_id=s.id AND f.organization_id=s.organization_id WHERE s.public_handle=$1 AND s.location_slug=$2 AND s.status='active' AND f.published=true LIMIT 1",
        [request.params.storeHandle, request.params.locationSlug]
      );
      if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The published store does not exist.');
      const storeRow = store.rows[0];
      const now = new Date();
      const token = randomBytes(32).toString('base64url');
      const client = await pool.connect();
      let reviewId = randomUUID();
      try {
        await client.query('BEGIN');
        const existing = await client.query(
          'SELECT id,status FROM store_reviews WHERE store_id=$1 AND reviewer_email=$2 FOR UPDATE',
          [storeRow.id, email]
        );
        if (existing.rowCount && existing.rows[0].status === 'published') {
          await client.query('ROLLBACK');
          return fail(reply, request, 409, 'REVIEW_ALREADY_SUBMITTED', 'This email has already submitted a review for this store.');
        }
        if (existing.rowCount) {
          reviewId = existing.rows[0].id;
          await client.query(
            "UPDATE store_reviews SET rating=$2,review_text=$3,email_verified_at=NULL,status='pending_verification',updated_at=$4,published_at=NULL WHERE id=$1",
            [reviewId, rating, reviewText, now]
          );
          await client.query('DELETE FROM store_review_verification_tokens WHERE review_id=$1', [reviewId]);
        } else {
          await client.query(
            "INSERT INTO store_reviews (id,store_id,rating,review_text,reviewer_email,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,'pending_verification',$6,$6)",
            [reviewId, storeRow.id, rating, reviewText, email, now]
          );
        }
        await client.query(
          'INSERT INTO store_review_verification_tokens (id,review_id,token_hash,created_at,expires_at) VALUES ($1,$2,$3,$4,$5)',
          [randomUUID(), reviewId, hash(token), now, new Date(now.getTime() + 1000 * 60 * 60 * 24)]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }

      let verificationEmailSent = false;
      if (process.env.AUTH_EMAIL_API_KEY && process.env.AUTH_EMAIL_FROM && process.env.AUTH_PUBLIC_URL) {
        try {
          const path = '/' + encodeURIComponent(storeRow.public_handle) + '/' + encodeURIComponent(storeRow.location_slug) + '?review=verify';
          const verificationUrl = authPublicUrl(path, token);
          await sendAuthEmail(
            email,
            'Verify your review for ' + String(storeRow.name).slice(0, 160),
            '<p>Thank you for sharing your experience.</p><p>Confirm your email to publish your five-heart review. This link expires in 24 hours.</p><p><a href="' + verificationUrl + '">Verify and publish my review</a></p><p>If you did not write this review, you can ignore this email.</p>'
          );
          verificationEmailSent = true;
        } catch (error) {
          request.log.error({ err: error }, 'Review verification email delivery failed');
        }
      }
      return reply.code(202).send({
        data: {
          status: 'pending_verification',
          verificationEmailSent,
          message: verificationEmailSent
            ? 'Check your email to verify and publish your review.'
            : 'Your review is saved but not published. Email verification delivery is not configured or could not be completed.'
        },
        requestId: request.id
      });
    }
  );

  app.post<{ Body: { token?: unknown } }>('/api/v1/public/reviews/verify', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const token = typeof request.body?.token === 'string' ? request.body.token : '';
    if (token.length < 20 || token.length > 200) return fail(reply, request, 400, 'INVALID_REVIEW_TOKEN', 'This review verification link is invalid or expired.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'SELECT t.id AS token_id,t.review_id,r.store_id FROM store_review_verification_tokens t JOIN store_reviews r ON r.id=t.review_id WHERE t.token_hash=$1 AND t.consumed_at IS NULL AND t.expires_at>$2 FOR UPDATE OF t,r',
        [hash(token), new Date()]
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return fail(reply, request, 400, 'INVALID_REVIEW_TOKEN', 'This review verification link is invalid or expired.');
      }
      const row = result.rows[0];
      const now = new Date();
      await client.query('UPDATE store_review_verification_tokens SET consumed_at=$2 WHERE id=$1', [row.token_id, now]);
      await client.query(
        "UPDATE store_reviews SET email_verified_at=$2,status='published',published_at=$2,updated_at=$2 WHERE id=$1",
        [row.review_id, now]
      );
      await client.query('DELETE FROM store_review_verification_tokens WHERE review_id=$1 AND id<>$2', [row.review_id, row.token_id]);
      await client.query('COMMIT');
      return { data: { verified: true, message: 'Your review is verified and published.' }, requestId: request.id };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
}
