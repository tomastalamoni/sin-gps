/**
 * Descargas guardadas con fecha en pipeline/raw/. Una fuente se baja una sola vez: después se
 * reusa la última copia, salvo con --refresh.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RAW_DIR, SOURCES, USER_AGENT } from '../config';

export interface RawFile {
  name: string;
  path: string;
  /** Fecha de descarga, AAAA-MM-DD. */
  date: string;
}

export interface ManifestEntry {
  file: string;
  source: string;
  downloadedAt: string;
  bytes: number;
  sha256: string;
}

const MANIFEST = join(RAW_DIR, 'manifest.json');

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** La copia más reciente de una fuente, si existe. */
export async function latestRaw(name: string, ext: string): Promise<RawFile | undefined> {
  if (!existsSync(RAW_DIR)) return undefined;
  const pattern = new RegExp(`^${name}-(\\d{4}-\\d{2}-\\d{2})\\.${ext}$`);
  const matches = (await readdir(RAW_DIR))
    .map((file) => ({ file, match: pattern.exec(file) }))
    .filter((x): x is { file: string; match: RegExpExecArray } => x.match !== null)
    .sort((a, b) => a.file.localeCompare(b.file));
  const last = matches.at(-1);
  if (!last) return undefined;
  return { name, path: join(RAW_DIR, last.file), date: last.match[1] ?? '' };
}

export async function readManifest(): Promise<Record<string, ManifestEntry>> {
  if (!existsSync(MANIFEST)) return {};
  return JSON.parse(await readFile(MANIFEST, 'utf8')) as Record<string, ManifestEntry>;
}

/**
 * Devuelve la copia guardada o baja la fuente, la guarda con fecha y la anota en el manifiesto.
 * `problem` revisa una copia guardada: si está incompleta, se vuelve a bajar.
 */
export async function ensureRaw(
  name: string,
  ext: string,
  source: string,
  download: () => Promise<string>,
  refresh: boolean,
  problem?: (text: string) => string | undefined,
): Promise<RawFile> {
  const existing = await latestRaw(name, ext);
  if (existing && !refresh) {
    const issue = problem?.(await readFile(existing.path, 'utf8'));
    if (!issue) {
      console.log(`  ${name}: uso la copia del ${existing.date}`);
      return existing;
    }
    console.log(
      `  ${name}: la copia del ${existing.date} está incompleta (${issue}); la bajo de nuevo`,
    );
  }
  console.log(`  ${name}: bajando…`);
  const text = await download();
  await mkdir(RAW_DIR, { recursive: true });
  const date = today();
  const path = join(RAW_DIR, `${name}-${date}.${ext}`);
  await writeFile(path, text, 'utf8');
  const manifest = await readManifest();
  manifest[name] = {
    file: path,
    source,
    downloadedAt: new Date().toISOString(),
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
  };
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`  ${name}: ${(Buffer.byteLength(text) / 1e6).toFixed(1)} MB`);
  return { name, path, date };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);
  return response.text();
}

/**
 * Overpass contesta 200 con datos a medias cuando se le acaba el tiempo o la memoria, y lo avisa
 * en `remark`. Devuelve el problema, o undefined si la respuesta está completa.
 */
export function overpassProblem(text: string): string | undefined {
  let remark: unknown;
  try {
    remark = (JSON.parse(text) as { remark?: unknown }).remark;
  } catch {
    return 'JSON incompleto';
  }
  if (typeof remark !== 'string') return undefined;
  return /error|timed out|out of memory/i.test(remark) ? remark : undefined;
}

/**
 * Consulta Overpass. Si un servidor está saturado (429, 502, 503, 504) o corta la respuesta,
 * reintenta con espera y después prueba el siguiente de la lista.
 */
export async function overpass(query: string): Promise<string> {
  const errors: string[] = [];
  for (const server of SOURCES.overpass) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await fetch(server, {
          method: 'POST',
          headers: {
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ data: query }),
        });
        const text = await response.text();
        if (response.ok && text.trimStart().startsWith('{')) {
          const problem = overpassProblem(text);
          if (!problem) return text;
          errors.push(`${server}: ${problem.slice(0, 120)}`);
        } else {
          errors.push(
            `${server}: HTTP ${response.status} ${text.slice(0, 80).replace(/\s+/g, ' ')}`,
          );
          if (![429, 502, 503, 504].includes(response.status)) break;
        }
      } catch (error) {
        errors.push(`${server}: ${String(error)}`);
      }
      const wait = 15_000 * 2 ** attempt;
      console.log(`    Overpass ocupado; reintento en ${wait / 1000} s`);
      await sleep(wait);
    }
  }
  throw new Error(`Overpass no respondió:\n${errors.join('\n')}`);
}
