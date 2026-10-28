import 'fake-indexeddb/auto'

// `crypto.subtle` and `crypto.randomUUID` exist in Node 20, but `structuredClone`-based
// IndexedDB shims need Blob support that is already global there too, so nothing else to add.
