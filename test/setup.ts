import { vi } from 'vitest';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Mock fetch for testing
global.fetch = vi.fn();

// Mock Cloudflare Worker globals
Object.assign(global, {
  Request: class MockRequest {
    url: string;
    method: string;
    headers: Headers;
    body: ReadableStream | null;
    private _bodyContent: string;

    constructor(input: string | Request, init?: RequestInit) {
      this.url = typeof input === 'string' ? input : input.url;
      this.method = init?.method || 'GET';
      this.headers = new Headers(init?.headers);
      this.body = null;
      this._bodyContent = init?.body as string || '';
    }

    async json() {
      if (!this._bodyContent) return {};
      try {
        return JSON.parse(this._bodyContent);
      } catch {
        throw new Error('Invalid JSON');
      }
    }

    async text() {
      return this._bodyContent;
    }
  },
  
  Response: class MockResponse {
    status: number;
    statusText: string;
    headers: Headers;
    body: ReadableStream | null;
    ok: boolean;
    private _bodyContent: string;

    constructor(body?: BodyInit | null, init?: ResponseInit) {
      this.status = init?.status || 200;
      this.statusText = init?.statusText || 'OK';
      this.headers = new Headers(init?.headers);
      this.body = body as ReadableStream | null;
      this.ok = this.status >= 200 && this.status < 300;
      this._bodyContent = typeof body === 'string' ? body : '';
    }

    async json() {
      if (!this._bodyContent) return {};
      try {
        return JSON.parse(this._bodyContent);
      } catch {
        throw new Error('Invalid JSON');
      }
    }

    async text() {
      return this._bodyContent;
    }
  },

  Headers: class MockHeaders extends Map {
    constructor(init?: HeadersInit) {
      super();
      if (init) {
        if (Array.isArray(init)) {
          init.forEach(([key, value]) => this.set(key.toLowerCase(), value));
        } else if (init instanceof Headers) {
          init.forEach((value, key) => this.set(key.toLowerCase(), value));
        } else {
          Object.entries(init).forEach(([key, value]) => this.set(key.toLowerCase(), value));
        }
      }
    }

    get(name: string): string | null {
      return super.get(name.toLowerCase()) || null;
    }

    set(name: string, value: string): this {
      super.set(name.toLowerCase(), value);
      return this;
    }

    has(name: string): boolean {
      return super.has(name.toLowerCase());
    }

    delete(name: string): boolean {
      return super.delete(name.toLowerCase());
    }
  },

  TransformStream: class MockTransformStream {
    readable: ReadableStream;
    writable: WritableStream;

    constructor() {
      this.readable = new ReadableStream();
      this.writable = new WritableStream();
    }
  },

  ReadableStream: class MockReadableStream {
    getReader() {
      return {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
        cancel: vi.fn()
      };
    }
  },

  WritableStream: class MockWritableStream {
    getWriter() {
      return {
        write: vi.fn(),
        close: vi.fn(),
        abort: vi.fn(),
        releaseLock: vi.fn()
      };
    }
  },

  TextEncoder: class MockTextEncoder {
    encode(input: string) {
      return new Uint8Array(Buffer.from(input, 'utf8'));
    }
  },

  TextDecoder: class MockTextDecoder {
    decode(input?: BufferSource, options?: { stream?: boolean }) {
      if (!input) return '';
      if (input instanceof ArrayBuffer) {
        return Buffer.from(new Uint8Array(input)).toString('utf8');
      }
      return Buffer.from(input as Uint8Array).toString('utf8');
    }
  }
});