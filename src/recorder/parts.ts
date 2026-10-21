// Découpe le fichier MP4 en cours d'écriture en morceaux de taille fixe (8 Mo), prêts à être
// stockés et envoyés en ligne pendant l'enregistrement (envoi « multipart » de Cloudflare R2 :
// tous les morceaux sauf le dernier doivent avoir exactement la même taille).
//
// Le MP4 est écrit d'un bout à l'autre, puis l'encodeur revient au début pour inscrire la taille
// finale des données : le premier morceau est donc gardé en mémoire et envoyé en dernier.
// Si une écriture tardive touche un autre morceau déjà envoyé, il est simplement renvoyé.

export const PART_SIZE = 8 * 1024 * 1024

export type PartSink = (index: number, data: Blob) => Promise<void>
/** Relit un morceau déjà envoyé (pour le corriger, cas rare). */
export type PartReader = (index: number) => Promise<Blob | null>

export class PartWriter {
  private parts = new Map<number, Uint8Array<ArrayBuffer>>()
  /** Tampons de 8 Mo réutilisés : ni allocation ni copie en cours d'enregistrement. */
  private pool: Uint8Array<ArrayBuffer>[] = []
  private flushed = new Set<number>()
  private queue: Promise<void> = Promise.resolve()
  private failure: unknown = null
  private highest = 0
  private sink: PartSink
  private reader: PartReader

  constructor(sink: PartSink, reader: PartReader) {
    this.sink = sink
    this.reader = reader
  }

  /** Flux à donner à l'encodeur (StreamTarget de Mediabunny). */
  get writable() {
    return new WritableStream<{ type: 'write'; data: Uint8Array; position: number }>({
      write: (chunk) => {
        this.write(chunk.data, chunk.position)
        // Contre-pression : on ne laisse pas la file d'écriture grossir sans limite.
        return this.queue
      },
    })
  }

  private write(data: Uint8Array, position: number) {
    if (this.failure) throw this.failure
    let offset = 0
    while (offset < data.length) {
      const pos = position + offset
      const index = Math.floor(pos / PART_SIZE)
      const start = pos - index * PART_SIZE
      const n = Math.min(data.length - offset, PART_SIZE - start)
      const slice = data.subarray(offset, offset + n)
      if (this.flushed.has(index)) this.patchFlushed(index, start, slice)
      else this.buffer(index).set(slice, start)
      offset += n
    }
    this.highest = Math.max(this.highest, position + data.length)
    // Tout morceau entièrement dépassé (sauf le premier) part au stockage.
    const done = Math.floor(position / PART_SIZE)
    for (const index of [...this.parts.keys()]) if (index > 0 && index < done) this.flush(index, PART_SIZE)
  }

  private buffer(index: number) {
    let b = this.parts.get(index)
    if (!b) {
      b = this.pool.pop() ?? new Uint8Array(PART_SIZE)
      this.parts.set(index, b)
    }
    return b
  }

  private flush(index: number, length: number) {
    const b = this.parts.get(index)!
    this.parts.delete(index)
    this.flushed.add(index)
    const blob = new Blob([b.subarray(0, length)]) // le Blob prend sa propre copie : le tampon resservira
    if (this.pool.length < 2) this.pool.push(b)
    this.enqueue(() => this.sink(index, blob))
  }

  private patchFlushed(index: number, start: number, slice: Uint8Array) {
    const copy = slice.slice()
    this.enqueue(async () => {
      const old = await this.reader(index)
      if (!old) throw new Error(`Morceau ${index} introuvable`)
      const bytes = new Uint8Array(await old.arrayBuffer())
      bytes.set(copy, start)
      await this.sink(index, new Blob([bytes]))
    })
  }

  private enqueue(task: () => Promise<void>) {
    this.queue = this.queue.then(task).catch((e) => {
      this.failure = e
      throw e
    })
    this.queue.catch(() => {})
  }

  /** Envoie tout ce qui reste (dont le premier morceau) et attend la fin. Renvoie la taille totale. */
  async close() {
    const last = Math.floor((this.highest - 1) / PART_SIZE)
    for (const index of [...this.parts.keys()].sort((a, b) => b - a)) {
      const length = index === last ? this.highest - index * PART_SIZE : PART_SIZE
      this.flush(index, length)
    }
    await this.queue
    if (this.failure) throw this.failure
    return { size: this.highest, parts: last + 1 }
  }
}
