import { QrDesign } from '../qr/qr-design.model';
import { QrContentType, QrPayloadData } from '../qr/qr-payloads';

export interface QrProject {
  id: string;
  name: string;
  contentType: QrContentType;
  contentData: QrPayloadData;
  rawPayload: string;
  design: QrDesign;
  createdAt: number;
  updatedAt: number;
}
