export type QrContentType =
  | 'website'
  | 'text'
  | 'wifi'
  | 'vcard'
  | 'email'
  | 'phone'
  | 'sms'
  | 'whatsapp'
  | 'location'
  | 'event'
  | 'app_link'
  | 'social'
  | 'pdf'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'google_form'
  | 'google_review'
  | 'multi_url'
  | 'menu'
  | 'booking'
  | 'feedback'
  | 'payment'
  | 'coupon'
  | 'list_links'
  | 'custom_url'
  | 'google_docs'
  | 'google_sheets'
  | 'telegram'
  | 'spotify'
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'tiktok'
  | 'linkedin'
  | 'x'
  | 'snapchat'
  | 'bitcoin'
  | 'crypto_wallet'
  | 'document'
  | 'presentation';

export type QrPayloadData = Record<string, string | number | boolean>;

export type QrMode = 'static' | 'dynamic';

export interface QrCapabilities {
  static: boolean;
  dynamic: boolean;
  hostedContent?: boolean;
}

export type QrFieldType =
  | 'text'
  | 'url'
  | 'email'
  | 'tel'
  | 'password'
  | 'textarea'
  | 'number'
  | 'datetime-local'
  | 'select'
  | 'checkbox';

export interface QrFieldOption {
  value: string;
  label: string;
}

export interface QrFieldDefinition {
  key: string;
  label: string;
  type: QrFieldType;
  placeholder?: string;
  required?: boolean;
  options?: QrFieldOption[];
  help?: string;
}

export interface QrContentTypeDefinition {
  id: QrContentType;
  label: string;
  icon: string;
  category: 'web' | 'contact' | 'communication' | 'utility' | 'business' | 'files' | 'social' | 'payment';
  description: string;
  capabilities: QrCapabilities;
  fields: QrFieldDefinition[];
  defaultData: QrPayloadData;
  serialize: (data: QrPayloadData) => string;
}

function s(v: unknown): string {
  return v !== undefined && v !== null ? String(v) : '';
}

export const QR_CONTENT_TYPES: QrContentTypeDefinition[] = [
  {
    id: 'website',
    label: 'Website',
    icon: 'language',
    category: 'web',
    description: 'Open any URL or web page directly',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'Website URL', type: 'url', placeholder: 'https://example.com', required: true },
    ],
    defaultData: {
      url: '',
    },
    serialize: (data) => {
      let url = s(data['url']).trim();
      if (!url) return url;
      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
      }
      return url;
    },
  },
  {
    id: 'text',
    label: 'Plain Text',
    icon: 'notes',
    category: 'utility',
    description: 'Display unformatted text, notes, or serial keys',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'text', label: 'Text', type: 'textarea', placeholder: 'Type or paste your message', required: true },
    ],
    defaultData: {
      text: '',
    },
    serialize: (data) => s(data['text']),
  },
  {
    id: 'wifi',
    label: 'Wi-Fi Network',
    icon: 'wifi',
    category: 'utility',
    description: 'Instant zero-tap Wi-Fi connection',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'ssid', label: 'Network name', type: 'text', placeholder: 'Wi-Fi network name', required: true },
      { key: 'encryption', label: 'Security', type: 'select', options: [
        { value: 'WPA', label: 'WPA / WPA2 / WPA3' },
        { value: 'WEP', label: 'WEP' },
        { value: 'nopass', label: 'Open network' },
      ] },
      { key: 'password', label: 'Password', type: 'password', placeholder: 'Network password' },
      { key: 'hidden', label: 'Hidden network', type: 'checkbox' },
    ],
    defaultData: {
      ssid: '',
      encryption: 'WPA',
      password: '',
      hidden: false,
    },
    serialize: (data) => {
      const escape = (str: string) => str.replace(/([\\;,:"])/g, '\\$1');
      const ssid = escape(s(data['ssid']));
      const type = s(data['encryption']) || 'WPA';
      const password = escape(s(data['password']));
      const hidden = data['hidden'] ? 'true' : 'false';
      return `WIFI:S:${ssid};T:${type};P:${password};H:${hidden};;`;
    },
  },
  {
    id: 'vcard',
    label: 'Contact (vCard)',
    icon: 'contact_page',
    category: 'contact',
    description: 'Digital business card with name, phone, email & company',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'firstName', label: 'First name', type: 'text', placeholder: 'First name' },
      { key: 'lastName', label: 'Last name', type: 'text', placeholder: 'Last name' },
      { key: 'organization', label: 'Company', type: 'text', placeholder: 'Company or organization' },
      { key: 'title', label: 'Job title', type: 'text', placeholder: 'Job title' },
      { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+212 6 00 00 00 00' },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'name@example.com' },
      { key: 'website', label: 'Website', type: 'url', placeholder: 'https://example.com' },
      { key: 'note', label: 'Note', type: 'textarea', placeholder: 'Optional note' },
    ],
    defaultData: {
      firstName: '',
      lastName: '',
      organization: '',
      title: '',
      phone: '',
      email: '',
      website: '',
      note: '',
    },
    serialize: (data) => {
      const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${s(data['lastName'])};${s(data['firstName'])};;;`,
        `FN:${[s(data['firstName']), s(data['lastName'])].filter(Boolean).join(' ')}`,
      ];
      if (data['organization']) lines.push(`ORG:${s(data['organization'])}`);
      if (data['title']) lines.push(`TITLE:${s(data['title'])}`);
      if (data['phone']) lines.push(`TEL;TYPE=CELL,VOICE:${s(data['phone'])}`);
      if (data['email']) lines.push(`EMAIL;TYPE=PREF,INTERNET:${s(data['email'])}`);
      if (data['website']) lines.push(`URL:${s(data['website'])}`);
      if (data['note']) lines.push(`NOTE:${s(data['note'])}`);
      lines.push('END:VCARD');
      return lines.join('\n');
    },
  },
  {
    id: 'email',
    label: 'Email',
    icon: 'mail',
    category: 'communication',
    description: 'Draft an email with pre-filled subject and body',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'email', label: 'Email address', type: 'email', placeholder: 'name@example.com', required: true },
      { key: 'subject', label: 'Subject', type: 'text', placeholder: 'Email subject' },
      { key: 'body', label: 'Message', type: 'textarea', placeholder: 'Email body' },
    ],
    defaultData: {
      email: '',
      subject: '',
      body: '',
    },
    serialize: (data) => {
      const email = s(data['email']);
      const subject = encodeURIComponent(s(data['subject']));
      const body = encodeURIComponent(s(data['body']));
      const params: string[] = [];
      if (subject) params.push(`subject=${subject}`);
      if (body) params.push(`body=${body}`);
      return `mailto:${email}${params.length ? '?' + params.join('&') : ''}`;
    },
  },
  {
    id: 'phone',
    label: 'Phone Call',
    icon: 'call',
    category: 'communication',
    description: 'Direct tap-to-call phone number',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'phone', label: 'Phone number', type: 'tel', placeholder: '+212 6 00 00 00 00', required: true },
    ],
    defaultData: {
      phone: '',
    },
    serialize: (data) => `tel:${s(data['phone']).replace(/\s+/g, '')}`,
  },
  {
    id: 'sms',
    label: 'SMS Message',
    icon: 'chat',
    category: 'communication',
    description: 'Pre-composed SMS text message',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'phone', label: 'Phone number', type: 'tel', placeholder: '+212 6 00 00 00 00', required: true },
      { key: 'message', label: 'Message', type: 'textarea', placeholder: 'SMS message' },
    ],
    defaultData: {
      phone: '',
      message: '',
    },
    serialize: (data) => {
      const phone = s(data['phone']).replace(/\s+/g, '');
      const msg = data['message'] ? `?body=${encodeURIComponent(s(data['message']))}` : '';
      return `sms:${phone}${msg}`;
    },
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: 'send',
    category: 'communication',
    description: 'Open a WhatsApp chat with pre-written message',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'phone', label: 'WhatsApp number', type: 'tel', placeholder: '212600000000', required: true, help: 'Use the country code without + or spaces.' },
      { key: 'message', label: 'Message', type: 'textarea', placeholder: 'Optional pre-filled message' },
    ],
    defaultData: {
      phone: '',
      message: '',
    },
    serialize: (data) => {
      const cleanPhone = s(data['phone']).replace(/[^0-9]/g, '');
      const msg = data['message'] ? encodeURIComponent(s(data['message'])) : '';
      return `https://wa.me/${cleanPhone}${msg ? '?text=' + msg : ''}`;
    },
  },
  {
    id: 'location',
    label: 'Location / Maps',
    icon: 'place',
    category: 'utility',
    description: 'GPS coordinates or Google Maps navigation destination',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'mode', label: 'Location input', type: 'select', options: [
        { value: 'query', label: 'Search or place name' },
        { value: 'coords', label: 'Latitude and longitude' },
      ] },
      { key: 'query', label: 'Place or address', type: 'text', placeholder: 'Casablanca, Morocco' },
      { key: 'latitude', label: 'Latitude', type: 'number', placeholder: '33.5731' },
      { key: 'longitude', label: 'Longitude', type: 'number', placeholder: '-7.5898' },
    ],
    defaultData: {
      query: '',
      latitude: '',
      longitude: '',
      mode: 'query', // 'query' | 'coords'
    },
    serialize: (data) => {
      if (data['mode'] === 'coords' && data['latitude'] && data['longitude']) {
        return `https://maps.google.com/?q=${data['latitude']},${data['longitude']}`;
      }
      return s(data['query']) ? `https://maps.google.com/?q=${encodeURIComponent(s(data['query']))}` : '';
    },
  },
  {
    id: 'event',
    label: 'Calendar Event',
    icon: 'event',
    category: 'utility',
    description: 'Add an event to Google, Apple, or Outlook calendar',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'title', label: 'Event name', type: 'text', placeholder: 'Event name', required: true },
      { key: 'location', label: 'Location', type: 'text', placeholder: 'Venue or address' },
      { key: 'startDate', label: 'Starts', type: 'datetime-local', required: true },
      { key: 'endDate', label: 'Ends', type: 'datetime-local', required: true },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Event details' },
    ],
    defaultData: {
      title: '',
      location: '',
      startDate: '',
      endDate: '',
      description: '',
    },
    serialize: (data) => {
      const formatDate = (iso: string) => {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      };
      const start = formatDate(s(data['startDate']));
      const end = formatDate(s(data['endDate']));
      return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        `SUMMARY:${s(data['title']) || 'Event'}`,
        start ? `DTSTART:${start}` : '',
        end ? `DTEND:${end}` : '',
        data['location'] ? `LOCATION:${s(data['location'])}` : '',
        data['description'] ? `DESCRIPTION:${s(data['description'])}` : '',
        'END:VEVENT',
        'END:VCALENDAR',
      ]
        .filter(Boolean)
        .join('\n');
    },
  },
  {
    id: 'app_link',
    label: 'App Store Link',
    icon: 'apps',
    category: 'web',
    description: 'Direct link to App Store or Google Play Store',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'platform', label: 'Platform', type: 'select', options: [
        { value: 'universal', label: 'Any device' },
        { value: 'ios', label: 'Apple App Store' },
        { value: 'android', label: 'Google Play' },
      ] },
      { key: 'url', label: 'App URL', type: 'url', placeholder: 'https://...', required: true },
    ],
    defaultData: {
      platform: 'universal',
      url: '',
    },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'social',
    label: 'Social Profile',
    icon: 'share',
    category: 'web',
    description: 'Direct link to Instagram, LinkedIn, YouTube, X, GitHub',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'platform', label: 'Platform', type: 'select', options: [
        { value: 'instagram', label: 'Instagram' },
        { value: 'linkedin', label: 'LinkedIn' },
        { value: 'x', label: 'X' },
        { value: 'youtube', label: 'YouTube' },
        { value: 'tiktok', label: 'TikTok' },
        { value: 'github', label: 'GitHub' },
      ] },
      { key: 'username', label: 'Username', type: 'text', placeholder: 'username', required: true },
    ],
    defaultData: {
      platform: 'instagram',
      username: '',
    },
    serialize: (data) => {
      const user = s(data['username']).replace(/^@/, '').trim();
      switch (data['platform']) {
        case 'instagram':
          return `https://instagram.com/${user}`;
        case 'linkedin':
          return `https://linkedin.com/in/${user}`;
        case 'x':
          return `https://x.com/${user}`;
        case 'youtube':
          return `https://youtube.com/@${user}`;
        case 'github':
          return `https://github.com/${user}`;
        case 'tiktok':
          return `https://tiktok.com/@${user}`;
        default:
          return `https://${user}`;
      }
    },
  },

  {
    id: 'pdf',
    label: 'PDF',
    icon: 'picture_as_pdf',
    category: 'web',
    description: 'Share a PDF document by link',
    capabilities: { static: true, dynamic: true, hostedContent: true },
    fields: [
      { key: 'url', label: 'PDF URL', type: 'url', placeholder: 'https://example.com/menu.pdf', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'image',
    label: 'Image',
    icon: 'image',
    category: 'web',
    description: 'Share an image by link',
    capabilities: { static: true, dynamic: true, hostedContent: true },
    fields: [
      { key: 'url', label: 'Image URL', type: 'url', placeholder: 'https://example.com/photo.jpg', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'video',
    label: 'Video',
    icon: 'video_library',
    category: 'web',
    description: 'Open a video from a direct link',
    capabilities: { static: true, dynamic: true, hostedContent: true },
    fields: [
      { key: 'url', label: 'Video URL', type: 'url', placeholder: 'https://example.com/video.mp4', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'audio',
    label: 'Audio',
    icon: 'audio_file',
    category: 'web',
    description: 'Open an audio file from a direct link',
    capabilities: { static: true, dynamic: true, hostedContent: true },
    fields: [
      { key: 'url', label: 'Audio URL', type: 'url', placeholder: 'https://example.com/audio.mp3', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'file',
    label: 'File',
    icon: 'attach_file',
    category: 'web',
    description: 'Share any downloadable file by URL',
    capabilities: { static: true, dynamic: true, hostedContent: true },
    fields: [
      { key: 'url', label: 'File URL', type: 'url', placeholder: 'https://example.com/file.zip', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'google_form',
    label: 'Google Form',
    icon: 'assignment',
    category: 'web',
    description: 'Send people directly to a Google Form',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'Form URL', type: 'url', placeholder: 'https://forms.google.com/...', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'google_review',
    label: 'Google Review',
    icon: 'rate_review',
    category: 'web',
    description: 'Send customers to your Google review page',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'Review URL', type: 'url', placeholder: 'https://g.page/.../review', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'multi_url',
    label: 'Multiple Links',
    icon: 'link',
    category: 'web',
    description: 'Show several destinations from one QR code',
    capabilities: { static: false, dynamic: true, hostedContent: true },
    fields: [
      { key: 'title', label: 'Page title', type: 'text', placeholder: 'My links' },
      { key: 'links', label: 'Links', type: 'textarea', placeholder: 'https://example.com\nhttps://instagram.com/username', required: true, help: 'One URL per line.' },
    ],
    defaultData: { title: '', links: '' },
    serialize: (data) => s(data['links']),
  },
  {
    id: 'menu',
    label: 'Digital Menu',
    icon: 'restaurant_menu',
    category: 'utility',
    description: 'Open a restaurant or service menu',
    capabilities: { static: true, dynamic: true, hostedContent: true },
    fields: [
      { key: 'url', label: 'Menu URL', type: 'url', placeholder: 'https://example.com/menu', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'booking',
    label: 'Booking',
    icon: 'calendar_month',
    category: 'utility',
    description: 'Open an appointment or reservation page',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'Booking URL', type: 'url', placeholder: 'https://example.com/book', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'feedback',
    label: 'Feedback',
    icon: 'feedback',
    category: 'communication',
    description: 'Send people to a feedback or survey page',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'Feedback URL', type: 'url', placeholder: 'https://example.com/feedback', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'payment',
    label: 'Payment Link',
    icon: 'payments',
    category: 'utility',
    description: 'Open a payment page or checkout link',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'Payment URL', type: 'url', placeholder: 'https://pay.example.com/...', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'coupon',
    label: 'Coupon',
    icon: 'local_offer',
    category: 'utility',
    description: 'Send customers to a coupon or offer',
    capabilities: { static: true, dynamic: true, hostedContent: true },
    fields: [
      { key: 'url', label: 'Offer URL', type: 'url', placeholder: 'https://example.com/offer', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'list_links',
    label: 'Link List',
    icon: 'format_list_bulleted',
    category: 'web',
    description: 'Open a page containing your selected links',
    capabilities: { static: false, dynamic: true, hostedContent: true },
    fields: [
      { key: 'links', label: 'Links', type: 'textarea', placeholder: 'https://example.com\nhttps://example.org', required: true, help: 'One URL per line.' },
    ],
    defaultData: { links: '' },
    serialize: (data) => s(data['links']),
  },

  {
    id: 'custom_url',
    label: 'Custom URL',
    icon: 'link',
    category: 'web',
    description: 'Encode a URL exactly as provided',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'URL', type: 'url', placeholder: 'https://example.com/path', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'google_docs',
    label: 'Google Docs',
    icon: 'description',
    category: 'web',
    description: 'Open a Google Docs document',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'Document URL', type: 'url', placeholder: 'https://docs.google.com/document/...', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'google_sheets',
    label: 'Google Sheets',
    icon: 'table_chart',
    category: 'web',
    description: 'Open a Google Sheets spreadsheet',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'Spreadsheet URL', type: 'url', placeholder: 'https://docs.google.com/spreadsheets/...', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: 'send',
    category: 'social',
    description: 'Open a Telegram profile, channel, or chat',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'Telegram URL', type: 'url', placeholder: 'https://t.me/username', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'spotify',
    label: 'Spotify',
    icon: 'music_note',
    category: 'social',
    description: 'Open a Spotify track, album, playlist, or profile',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'Spotify URL', type: 'url', placeholder: 'https://open.spotify.com/...', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: 'photo_camera',
    category: 'social',
    description: 'Open an Instagram profile or post',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'Instagram URL', type: 'url', placeholder: 'https://instagram.com/username', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: 'public',
    category: 'social',
    description: 'Open a Facebook page, profile, or post',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'Facebook URL', type: 'url', placeholder: 'https://facebook.com/...', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'youtube',
    label: 'YouTube',
    icon: 'play_circle',
    category: 'social',
    description: 'Open a YouTube video, channel, or playlist',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'YouTube URL', type: 'url', placeholder: 'https://youtube.com/watch?v=...', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: 'music_video',
    category: 'social',
    description: 'Open a TikTok profile or video',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'TikTok URL', type: 'url', placeholder: 'https://tiktok.com/@username', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: 'work',
    category: 'social',
    description: 'Open a LinkedIn profile, company, or post',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'LinkedIn URL', type: 'url', placeholder: 'https://linkedin.com/in/username', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'x',
    label: 'X',
    icon: 'alternate_email',
    category: 'social',
    description: 'Open an X profile or post',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'X URL', type: 'url', placeholder: 'https://x.com/username', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'snapchat',
    label: 'Snapchat',
    icon: 'camera',
    category: 'social',
    description: 'Open a Snapchat profile or shared link',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'url', label: 'Snapchat URL', type: 'url', placeholder: 'https://www.snapchat.com/...', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'bitcoin',
    label: 'Bitcoin',
    icon: 'currency_bitcoin',
    category: 'payment',
    description: 'Encode a Bitcoin payment address or URI',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'address', label: 'Bitcoin address', type: 'text', placeholder: 'bc1...', required: true },
      { key: 'amount', label: 'Amount', type: 'number', placeholder: '0.001' },
      { key: 'label', label: 'Label', type: 'text', placeholder: 'Optional payment label' },
    ],
    defaultData: { address: '', amount: '', label: '' },
    serialize: (data) => {
      const address = s(data['address']).trim();
      if (!address) return '';
      const params: string[] = [];
      if (data['amount']) params.push(`amount=${encodeURIComponent(s(data['amount']))}`);
      if (data['label']) params.push(`label=${encodeURIComponent(s(data['label']))}`);
      return `bitcoin:${address}${params.length ? '?' + params.join('&') : ''}`;
    },
  },
  {
    id: 'crypto_wallet',
    label: 'Crypto Wallet',
    icon: 'account_balance_wallet',
    category: 'payment',
    description: 'Encode a cryptocurrency wallet address or URI',
    capabilities: { static: true, dynamic: true },
    fields: [
      { key: 'uri', label: 'Wallet URI or address', type: 'text', placeholder: 'Wallet address or payment URI', required: true },
    ],
    defaultData: { uri: '' },
    serialize: (data) => s(data['uri']).trim(),
  },
  {
    id: 'document',
    label: 'Document', 
    icon: 'description',
    category: 'files',
    description: 'Share a document from a web address',
    capabilities: { static: true, dynamic: true, hostedContent: true },
    fields: [
      { key: 'url', label: 'Document URL', type: 'url', placeholder: 'https://example.com/document', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
  {
    id: 'presentation',
    label: 'Presentation',
    icon: 'slideshow',
    category: 'files',
    description: 'Share a presentation from a web address',
    capabilities: { static: true, dynamic: true, hostedContent: true },
    fields: [
      { key: 'url', label: 'Presentation URL', type: 'url', placeholder: 'https://example.com/presentation', required: true },
    ],
    defaultData: { url: '' },
    serialize: (data) => s(data['url']),
  },
];

export function getContentTypeDefinition(type: QrContentType): QrContentTypeDefinition {
  return QR_CONTENT_TYPES.find((t) => t.id === type) || QR_CONTENT_TYPES[0];
}
