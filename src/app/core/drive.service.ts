import { computed, inject, Injectable, signal } from '@angular/core';
import { CLOUD } from './cloud.config';
import { StorageService } from './storage.service';

const FOLDER_KEY = 'it_companion_folder_v1';
const GIS = 'https://accounts.google.com/gsi/client';
const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
/** Appen ser bara filer den själv har skapat. */
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'Italiano Companion – bibliotek';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export interface DriveFile {
  id: string;
  name: string;
  size: number;
}

/** Ett fel med en förklaring som går att visa. */
export class DriveError extends Error {}

interface TokenResponse {
  access_token?: string;
  expires_in?: string | number;
  error?: string;
}

interface TokenClient {
  requestAccessToken(override?: { prompt?: string }): void;
}

/** Det av Google Identity Services som används här. */
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string }) => void;
      }): TokenClient;
    };
  };
}

/**
 * Google Drive, på de två sätt en statisk sida kan nå det.
 *
 * Läsa: den publika mappen läses med en API-nyckel, utan inloggning — det är så en anonym
 * besökare hämtar biblioteket. Skriva: den som publicerar loggar in med Google i
 * webbläsaren och får en token som gäller i ungefär en timme. Ingen hemlighet ligger i koden.
 */
@Injectable({ providedIn: 'root' })
export class DriveService {
  private readonly storage = inject(StorageService);

  private client: TokenClient | null = null;
  private loading: Promise<void> | null = null;
  private waiting: { resolve: () => void; reject: (e: Error) => void } | null = null;
  private token = '';
  private readonly expires = signal(0);
  /** Mappen som skapades härifrån men ännu inte står i cloud.config.ts. */
  private readonly localFolder = signal('');

  /** Sant när inloggning går att erbjuda — ett klient-ID är inlagt. */
  readonly canConnect = !!CLOUD.clientId;
  /** Sant medan en token gäller. */
  readonly connected = computed(() => this.expires() > Date.now());
  readonly folderId = computed(() => CLOUD.folderId || this.localFolder());
  /** Sant när mappen finns men bara den här webbläsaren känner till den. */
  readonly folderIsLocal = computed(() => !CLOUD.folderId && !!this.localFolder());
  /** Sant när biblioteket går att läsa: en mapp, och en nyckel eller en inloggning. */
  readonly canRead = computed(() => !!this.folderId() && (!!CLOUD.apiKey || this.connected()));

  async load(): Promise<void> {
    this.localFolder.set((await this.storage.get(FOLDER_KEY)) ?? '');
  }

  /**
   * Laddar Googles inloggning i förväg. Anropas när sidan med knappen öppnas, så att själva
   * tryckningen kan öppna popupen direkt — annars kan webbläsaren blockera den.
   */
  prepare(): Promise<void> {
    if (!this.canConnect) return Promise.reject(new DriveError('Inget klient-ID är inlagt.'));
    this.loading ??= new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS;
      script.async = true;
      script.onload = () => {
        const gis = (window as unknown as { google?: Gis }).google;
        if (!gis) return reject(new DriveError('Googles inloggning gick inte att ladda.'));
        this.client = gis.accounts.oauth2.initTokenClient({
          client_id: CLOUD.clientId,
          scope: SCOPE,
          callback: (response) => this.onToken(response),
          error_callback: (error) =>
            this.settle(
              new DriveError(
                error.type === 'popup_closed'
                  ? 'Inloggningen stängdes.'
                  : 'Inloggningen gick inte att öppna. Tillåt popupfönster och försök igen.',
              ),
            ),
        });
        resolve();
      };
      script.onerror = () => {
        this.loading = null;
        reject(new DriveError('Googles inloggning gick inte att ladda.'));
      };
      document.head.appendChild(script);
    });
    return this.loading;
  }

  /** Loggar in och hämtar en token. Ska anropas direkt ur en tryckning. */
  async connect(): Promise<void> {
    if (!this.client) await this.prepare();
    return new Promise<void>((resolve, reject) => {
      this.waiting = { resolve, reject };
      this.client!.requestAccessToken();
    });
  }

  /** Paketen i mappen, i namnordning. */
  async list(): Promise<DriveFile[]> {
    const folder = this.folderId();
    if (!folder) return [];
    const files: DriveFile[] = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({
        q: `'${folder}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, size)',
        orderBy: 'name',
        pageSize: '1000',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await this.read(`${FILES}?${params}`);
      const page = (await res.json()) as {
        nextPageToken?: string;
        files?: { id: string; name: string; size?: string }[];
      };
      for (const f of page.files ?? []) {
        files.push({ id: f.id, name: f.name, size: Number(f.size) || 0 });
      }
      pageToken = page.nextPageToken ?? '';
    } while (pageToken);
    return files;
  }

  /** Innehållet i en fil. */
  async download(id: string): Promise<Uint8Array> {
    const res = await this.read(`${FILES}/${encodeURIComponent(id)}?alt=media`);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Laddar upp en fil till mappen. Kräver inloggning. */
  async upload(name: string, bytes: Uint8Array): Promise<DriveFile> {
    const folder = this.folderId();
    if (!folder) throw new DriveError('Det finns ingen mapp att ladda upp till.');
    const boundary = `itpk${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify({ name, parents: [folder] }),
      `\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
      bytes.slice(),
      `\r\n--${boundary}--`,
    ]);
    const res = await this.write(`${UPLOAD}?uploadType=multipart&fields=id,name,size`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    const file = (await res.json()) as { id: string; name: string; size?: string };
    return { id: file.id, name: file.name, size: Number(file.size) || bytes.byteLength };
  }

  /**
   * Skapar den publika mappen och gör den läsbar för alla med länken. Appen måste själv
   * skapa mappen — med scopet drive.file får den inte skriva i en mapp någon annan gjort.
   */
  async createFolder(): Promise<string> {
    const created = await this.write(`${FILES}?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
    });
    const { id } = (await created.json()) as { id: string };
    await this.write(`${FILES}/${encodeURIComponent(id)}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
    this.localFolder.set(id);
    void this.storage.set(FOLDER_KEY, id);
    return id;
  }

  private onToken(response: TokenResponse): void {
    if (response.error || !response.access_token) {
      this.settle(new DriveError('Google gav ingen åtkomst.'));
      return;
    }
    this.token = response.access_token;
    // En minut tillgodo, så att en token inte går ut mitt i en uppladdning.
    this.expires.set(Date.now() + (Number(response.expires_in) || 3600) * 1000 - 60_000);
    this.settle();
  }

  private settle(error?: Error): void {
    const waiting = this.waiting;
    this.waiting = null;
    if (error) waiting?.reject(error);
    else waiting?.resolve();
  }

  /** Läser med inloggningen om den finns, annars med API-nyckeln. */
  private read(url: string): Promise<Response> {
    if (this.connected()) return this.send(url, { headers: this.bearer() });
    if (!CLOUD.apiKey) throw new DriveError('Biblioteket går inte att läsa utan API-nyckel.');
    return this.send(
      `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(CLOUD.apiKey)}`,
    );
  }

  private write(url: string, init: RequestInit): Promise<Response> {
    if (!this.connected()) throw new DriveError('Logga in med Google först.');
    return this.send(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), ...this.bearer() },
    });
  }

  private bearer(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }

  private async send(url: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      throw new DriveError('Kom inte fram till Google Drive. Kontrollera uppkopplingen.');
    }
    if (res.ok) return res;
    if (res.status === 401) {
      this.expires.set(0);
      throw new DriveError('Inloggningen har gått ut. Logga in igen.');
    }
    if (res.status === 404) {
      throw new DriveError('Mappen eller filen finns inte, eller är inte delad.');
    }
    if (res.status === 403 || res.status === 429) {
      throw new DriveError('Google Drive sa nej — fel behörighet, eller för många anrop just nu.');
    }
    throw new DriveError(`Google Drive svarade med ett fel (${res.status}).`);
  }
}
