// IndexedDB utility for storing recording chunks and metadata
// Provides resilience against crashes, network issues, and browser closures

const DB_NAME = 'orah-lecture-recordings'
const DB_VERSION = 1
const STORE_CHUNKS = 'audio-chunks'
const STORE_METADATA = 'recording-metadata'

interface RecordingMetadata {
  id: string
  userId: string
  startTime: number
  duration: number
  chunksCount: number
  lastSaved: number
  noteId?: string
}

let db: IDBDatabase | null = null

// Initialize IndexedDB
export async function initRecordingDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result

      // Store for audio chunks
      if (!database.objectStoreNames.contains(STORE_CHUNKS)) {
        const chunksStore = database.createObjectStore(STORE_CHUNKS, { keyPath: 'id', autoIncrement: true })
        chunksStore.createIndex('recordingId', 'recordingId', { unique: false })
      }

      // Store for recording metadata
      if (!database.objectStoreNames.contains(STORE_METADATA)) {
        const metadataStore = database.createObjectStore(STORE_METADATA, { keyPath: 'id' })
        metadataStore.createIndex('userId', 'userId', { unique: false })
      }
    }
  })
}

// Save audio chunk to IndexedDB
export async function saveChunk(recordingId: string, chunk: Blob, chunkIndex: number): Promise<void> {
  const database = await initRecordingDB()
  const transaction = database.transaction([STORE_CHUNKS], 'readwrite')
  const store = transaction.objectStore(STORE_CHUNKS)

  return new Promise((resolve, reject) => {
    const request = store.add({
      recordingId,
      chunkIndex,
      data: chunk,
      timestamp: Date.now(),
    })

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// Get all chunks for a recording
export async function getChunks(recordingId: string): Promise<Blob[]> {
  const database = await initRecordingDB()
  const transaction = database.transaction([STORE_CHUNKS], 'readonly')
  const store = transaction.objectStore(STORE_CHUNKS)
  const index = store.index('recordingId')

  return new Promise((resolve, reject) => {
    const request = index.getAll(recordingId)

    request.onsuccess = () => {
      const chunks = request.result
        .sort((a, b) => a.chunkIndex - b.chunkIndex)
        .map((item) => item.data as Blob)
      resolve(chunks)
    }

    request.onerror = () => reject(request.error)
  })
}

// Save recording metadata
export async function saveMetadata(metadata: RecordingMetadata): Promise<void> {
  const database = await initRecordingDB()
  const transaction = database.transaction([STORE_METADATA], 'readwrite')
  const store = transaction.objectStore(STORE_METADATA)

  return new Promise((resolve, reject) => {
    const request = store.put(metadata)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// Get recording metadata
export async function getMetadata(recordingId: string): Promise<RecordingMetadata | null> {
  const database = await initRecordingDB()
  const transaction = database.transaction([STORE_METADATA], 'readonly')
  const store = transaction.objectStore(STORE_METADATA)

  return new Promise((resolve, reject) => {
    const request = store.get(recordingId)

    request.onsuccess = () => {
      resolve(request.result || null)
    }

    request.onerror = () => reject(request.error)
  })
}

// Get all incomplete recordings for a user
export async function getIncompleteRecordings(userId: string): Promise<RecordingMetadata[]> {
  const database = await initRecordingDB()
  const transaction = database.transaction([STORE_METADATA], 'readonly')
  const store = transaction.objectStore(STORE_METADATA)
  const index = store.index('userId')

  return new Promise((resolve, reject) => {
    const request = index.getAll(userId)

    request.onsuccess = () => {
      // Filter for recordings that haven't been completed (no noteId means not processed)
      const incomplete = request.result.filter((meta) => !meta.noteId)
      resolve(incomplete)
    }

    request.onerror = () => reject(request.error)
  })
}

// Delete recording data (chunks + metadata)
export async function deleteRecording(recordingId: string): Promise<void> {
  const database = await initRecordingDB()
  
  // Delete chunks
  const chunksTransaction = database.transaction([STORE_CHUNKS], 'readwrite')
  const chunksStore = chunksTransaction.objectStore(STORE_CHUNKS)
  const chunksIndex = chunksStore.index('recordingId')
  
  return new Promise((resolve, reject) => {
    const chunksRequest = chunksIndex.openCursor(IDBKeyRange.only(recordingId))
    
    chunksRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      } else {
        // Delete metadata
        const metadataTransaction = database.transaction([STORE_METADATA], 'readwrite')
        const metadataStore = metadataTransaction.objectStore(STORE_METADATA)
        const metadataRequest = metadataStore.delete(recordingId)
        
        metadataRequest.onsuccess = () => resolve()
        metadataRequest.onerror = () => reject(metadataRequest.error)
      }
    }
    
    chunksRequest.onerror = () => reject(chunksRequest.error)
  })
}

// Mark recording as completed (has noteId)
export async function markRecordingComplete(recordingId: string, noteId: string): Promise<void> {
  const metadata = await getMetadata(recordingId)
  if (metadata) {
    metadata.noteId = noteId
    await saveMetadata(metadata)
  }
}
