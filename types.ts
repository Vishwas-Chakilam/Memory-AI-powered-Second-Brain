export type MemoryType = 'link' | 'note' | 'image' | 'pdf';

export interface AIMetadata {
  summary: string;
  topics: string[];
  mood: string[];
  colors: string[]; // Hex codes
  collection?: string; // Auto-assigned collection name
  relatedMemoryIds?: string[]; // IDs of related memories
  importance?: number; // 0-1 score for importance
}

export interface MemoryItem {
  id: string;
  type: MemoryType;
  content: string; // The raw text or URL. For PDF this might be the filename.
  imageData?: string; // Base64 for images OR PDFs
  aiMetadata: AIMetadata;
  embedding: number[];
  createdAt: number;
  lastResurfaced?: number; // When this memory was last shown
  resurfaceCount?: number; // How many times it's been resurfaced
}

export interface SearchResult extends MemoryItem {
  score: number; // Similarity score
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  memoryIds: string[];
  color?: string;
  createdAt: number;
}

export interface Insight {
  type: 'pattern' | 'trend' | 'connection' | 'reminder';
  title: string;
  description: string;
  memoryIds: string[];
  relevance: number;
}

// AI Response Schemas
export interface AnalysisResponse {
  summary: string;
  topics: string[];
  mood: string[];
  colors: string[];
  collection?: string;
  importance?: number;
}