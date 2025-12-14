import { GoogleGenAI, Type } from "@google/genai";
import { AIMetadata, AnalysisResponse, MemoryItem, Insight } from "../types";
import { cosineSimilarity } from "./vector";

// NOTE: In a production app, never expose keys in client code if possible.
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const EMBEDDING_MODEL = "text-embedding-004";

// Models configuration based on requirements
const SEARCH_MODEL = "gemini-2.5-flash"; // For Search Grounding
const FAST_MODEL = "gemini-2.5-flash-lite"; // Low latency
const IMAGE_MODEL = "gemini-3-pro-preview"; // Image analysis
const THINKING_MODEL = "gemini-3-pro-preview"; // Complex tasks (PDFs)

export const getEmbedding = async (text: string): Promise<number[]> => {
  const ai = getAI();
  try {
    const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text
    });
    return response.embedding?.values || [];
  } catch (error) {
    console.error("Embedding error:", error);
    return [];
  }
};

// Helper to get grounded context for links
async function getLinkContext(url: string): Promise<string> {
    const ai = getAI();
    try {
        const response = await ai.models.generateContent({
            model: SEARCH_MODEL,
            contents: `What is the core content, topics, and mood of this website? ${url}`,
            config: {
                tools: [{ googleSearch: {} }],
                // Note: Search Grounding does not support JSON schema or MIME type
            }
        });
        
        // Extract grounding chunks if available for verification (optional), but we just need the text summary
        return response.text || "No context found.";
    } catch (error) {
        console.warn("Search grounding failed:", error);
        return "";
    }
}

export const analyzeContent = async (
  content: string, 
  media?: { data: string, mimeType: string },
  inputType: 'link' | 'note' | 'image' | 'pdf' = 'note'
): Promise<AIMetadata> => {
  const ai = getAI();
  
  const systemInstruction = `
    You are the "brain" of a personal knowledge management system. 
    Analyze the user's input and return a structured JSON summary.

    **Instructions per type:**
    - **Images:** Identify prominent objects (e.g., "Laptop", "Mountain", "Coffee"). Extract 3-5 dominant hex colors.
    - **PDFs:** Extract the main document title and summarize key arguments/concepts.
    - **Links/Text:** Detect the underlying mood and topics.

    **General Rules:**
    1. Summarize the core meaning in 1-2 sentences.
    2. Extract broad topic tags (e.g., "Productivity", "Design", "Code") AND specific object tags if visual.
    3. Detect the emotional mood (e.g., "Inspirational", "Technical", "Calm").
    4. Detect colors: Return exact Hex codes in 'colors'. CRITICAL: Add English color names (e.g. "Red", "Dark Blue") to 'topics' so they are searchable.
    5. Assign a collection name: Create a meaningful collection name (1-3 words) that groups this memory with similar ones (e.g., "Work Projects", "Travel Ideas", "Design Inspiration", "Learning Notes").
    6. Assess importance: Rate importance from 0.0 to 1.0 (1.0 = very important, 0.5 = moderate, 0.0 = casual/trivial).
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING },
      topics: { type: Type.ARRAY, items: { type: Type.STRING } },
      mood: { type: Type.ARRAY, items: { type: Type.STRING } },
      colors: { type: Type.ARRAY, items: { type: Type.STRING } },
      collection: { type: Type.STRING },
      importance: { type: Type.NUMBER }
    },
    required: ["summary", "topics", "mood"]
  };

  let model = FAST_MODEL;
  let finalConfig: any = {
    systemInstruction,
    responseMimeType: "application/json",
    responseSchema: schema
  };
  
  let finalPrompt = content;

  // --- Model Selection & Pre-processing Logic ---
  
  if (inputType === 'link') {
      // 1. Use Google Search to get context
      const searchContext = await getLinkContext(content);
      finalPrompt = `URL: ${content}\n\nContext from Web Search: ${searchContext}\n\nAnalyze this memory.`;
      model = FAST_MODEL; // Use fast model for the final JSON formatting
  } 
  else if (inputType === 'image') {
      // 2. Use Gemini 3 Pro for Images
      model = IMAGE_MODEL;
  } 
  else if (inputType === 'pdf') {
      // 3. Use Gemini 3 Pro with Thinking for Documents
      model = THINKING_MODEL;
      finalConfig.thinkingConfig = { thinkingBudget: 32768 };
      // Note: When using thinking, we ensure maxOutputTokens is NOT set (it is undefined by default here)
  } 
  else {
      // 4. Use Flash Lite for fast text notes
      model = FAST_MODEL;
  }

  // --- Construct Payload ---

  const parts: any[] = [];
  
  if (media) {
    const data = media.data.replace(/^data:.*?;base64,/, "");
    parts.push({
      inlineData: {
        data: data,
        mimeType: media.mimeType
      }
    });
    
    const contextPrompt = inputType === 'pdf' 
      ? "Analyze this PDF document and the following context: " 
      : "Analyze this image and the following context: ";
      
    parts.push({ text: contextPrompt + finalPrompt });
  } else {
    parts.push({ text: finalPrompt });
  }

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts },
      config: finalConfig
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from AI");
    
    const parsed = JSON.parse(jsonText);
    
    // Defensive check to ensure arrays exist
    return {
        summary: parsed.summary || "No summary available.",
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        mood: Array.isArray(parsed.mood) ? parsed.mood : [],
        colors: Array.isArray(parsed.colors) ? parsed.colors : [],
        collection: parsed.collection || "General",
        importance: typeof parsed.importance === 'number' ? Math.max(0, Math.min(1, parsed.importance)) : 0.5
    };

  } catch (error) {
    console.error("Analysis Error", error);
    return {
      summary: "Could not analyze content.",
      topics: ["Uncategorized"],
      mood: [],
      colors: ["#CCCCCC"],
      collection: "General",
      importance: 0.5
    };
  }
};

// Find related memories based on semantic similarity
export const findRelatedMemories = async (
  memory: MemoryItem,
  allMemories: MemoryItem[],
  threshold: number = 0.65
): Promise<string[]> => {
  const related: string[] = [];
  
  for (const other of allMemories) {
    if (other.id === memory.id) continue;
    
    const similarity = cosineSimilarity(memory.embedding, other.embedding);
    
    // Also check topic overlap
    const topicOverlap = memory.aiMetadata.topics.filter(t => 
      other.aiMetadata.topics.some(ot => ot.toLowerCase() === t.toLowerCase())
    ).length;
    
    const topicBoost = topicOverlap > 0 ? 0.1 : 0;
    const finalScore = similarity + topicBoost;
    
    if (finalScore >= threshold) {
      related.push(other.id);
    }
  }
  
  return related.slice(0, 5); // Limit to 5 most related
};

// Generate insights from memories
export const generateInsights = async (memories: MemoryItem[]): Promise<Insight[]> => {
  if (memories.length < 3) return [];
  
  const ai = getAI();
  const insights: Insight[] = [];
  
  // Analyze patterns in topics
  const topicFrequency: Record<string, number> = {};
  memories.forEach(m => {
    m.aiMetadata.topics.forEach(topic => {
      topicFrequency[topic] = (topicFrequency[topic] || 0) + 1;
    });
  });
  
  const topTopics = Object.entries(topicFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .filter(([_, count]) => count >= 2);
  
  topTopics.forEach(([topic, count]) => {
    const relatedMemories = memories
      .filter(m => m.aiMetadata.topics.includes(topic))
      .map(m => m.id);
    
    if (relatedMemories.length >= 2) {
      insights.push({
        type: 'pattern',
        title: `Recurring Topic: ${topic}`,
        description: `You've saved ${count} memories related to ${topic}`,
        memoryIds: relatedMemories,
        relevance: Math.min(1, count / memories.length)
      });
    }
  });
  
  // Find memories that haven't been resurfaced in a while
  const now = Date.now();
  const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
  const forgottenMemories = memories
    .filter(m => {
      const lastSeen = m.lastResurfaced || m.createdAt;
      return (now - lastSeen) > ONE_MONTH && (m.aiMetadata.importance || 0.5) > 0.6;
    })
    .slice(0, 3)
    .map(m => m.id);
  
  if (forgottenMemories.length > 0) {
    insights.push({
      type: 'reminder',
      title: 'Important Memories to Revisit',
      description: `You have ${forgottenMemories.length} important memories you haven't seen in a while`,
      memoryIds: forgottenMemories,
      relevance: 0.8
    });
  }
  
  return insights;
};