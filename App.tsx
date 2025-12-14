import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MemoryItem, SearchResult } from './types';
import { analyzeContent, getEmbedding, findRelatedMemories, generateInsights } from './services/gemini';
import { saveMemory, getAllMemories, deleteMemory, getAllCollections, getMemoriesByCollection, saveCollection } from './services/db';
import { cosineSimilarity } from './services/vector';
import { Collection, Insight } from './types';
import { MemoryCard } from './components/MemoryCard';
import { MemoryDetail } from './components/MemoryDetail';

// Speech Recognition Type Shim
interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

const App: React.FC = () => {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemoryItem[] | null>(null);
  const [isResurfacing, setIsResurfacing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<MemoryItem | null>(null);
  const [activeView, setActiveView] = useState<'memories' | 'collections' | 'insights'>('memories');
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load memories on mount
  useEffect(() => {
    const initApp = async () => {
      setIsLoading(true);
      await Promise.all([
        loadMemories(),
        loadCollections()
      ]);
      checkIfInstalled();
      setupInstallPrompt();
      // Small delay for smooth loading animation
      setTimeout(() => setIsLoading(false), 300);
    };
    initApp();
  }, []);

  // Check if app is already installed
  const checkIfInstalled = () => {
    // Check if running as standalone (installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = (window.navigator as any).standalone === true;
    const isAndroidApp = document.referrer.includes('android-app://');
    
    if (isStandalone || isIOSStandalone || isAndroidApp) {
      setIsInstalled(true);
    }
  };

  // Setup install prompt
  const setupInstallPrompt = () => {
    // Check if we're on iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    
    // Listen for beforeinstallprompt event (Android/Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as any;
      setDeferredPrompt(promptEvent);
      console.log('✅ Install prompt available');
      // Show prompt after a short delay
      setTimeout(() => {
        setShowInstallPrompt(true);
      }, 2000);
    };
    
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // For iOS, show prompt after a delay if not installed
    if (isIOS && !isInstalled) {
      setTimeout(() => {
        setShowInstallPrompt(true);
      }, 3000);
    }

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      console.log('✅ App installed successfully');
      setIsInstalled(true);
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
    });
    
    // Check if already installable (for debugging)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      console.log('✅ Service Worker active - PWA should be installable');
    }
  };

  // Handle install button click
  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  // Generate insights when memories change
  useEffect(() => {
    if (memories.length > 0) {
      generateInsights(memories).then(setInsights).catch(console.error);
    }
  }, [memories]);

  // Toggle Theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const loadMemories = async () => {
    try {
      const items = await getAllMemories();
      setMemories(items);
      // Auto-create collections from memory metadata
      await updateCollectionsFromMemories(items);
    } catch (e) {
      console.error(e);
    }
  };

  const loadCollections = async () => {
    try {
      const items = await getAllCollections();
      setCollections(items);
    } catch (e) {
      console.error(e);
    }
  };

  const updateCollectionsFromMemories = async (memories: MemoryItem[]) => {
    const collectionMap = new Map<string, string[]>();
    
    memories.forEach(m => {
      const collectionName = m.aiMetadata.collection || 'General';
      if (!collectionMap.has(collectionName)) {
        collectionMap.set(collectionName, []);
      }
      collectionMap.get(collectionName)!.push(m.id);
    });

    // Load existing collections first
    const existingCollections = await getAllCollections();

    // Update or create collections
    for (const [name, memoryIds] of collectionMap.entries()) {
      const existing = existingCollections.find(c => c.name === name);
      if (existing) {
        // Update existing collection with unique memory IDs
        const uniqueIds = Array.from(new Set([...existing.memoryIds, ...memoryIds]));
        await saveCollection({
          ...existing,
          memoryIds: uniqueIds
        });
      } else {
        // Create new collection
        const newCollection: Collection = {
          id: crypto.randomUUID(),
          name,
          memoryIds,
          createdAt: Date.now()
        };
        await saveCollection(newCollection);
      }
    }
    
    await loadCollections();
  };

  // 1. Enhanced Hybrid Search Logic
  useEffect(() => {
    const performSearch = async () => {
      if (!searchQuery.trim()) {
        setSearchResults(null);
        return;
      }
      
      if (isResurfacing) setIsResurfacing(false);

      const lowerQ = searchQuery.toLowerCase();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      const NOW = Date.now();

      // Quick keyword filter for very short queries
      if (searchQuery.length < 3) {
        const filtered = memories.filter(m => 
          m.content.toLowerCase().includes(lowerQ) || 
          m.aiMetadata.summary.toLowerCase().includes(lowerQ) ||
          (m.aiMetadata.topics || []).some(t => t.toLowerCase().includes(lowerQ))
        );
        setSearchResults(filtered);
        return;
      }

      // Semantic Search + Boosts
      try {
        const queryEmbedding = await getEmbedding(searchQuery);
        
        // Base results from vector search
        let scoredResults: SearchResult[] = [];

        if (queryEmbedding.length > 0) {
            scoredResults = memories.map(memory => {
                let score = cosineSimilarity(queryEmbedding, memory.embedding);
                
                // --- Boost 1: Recency (Decay over 60 days) ---
                const age = NOW - memory.createdAt;
                const recencyScore = Math.max(0, 1 - (age / (60 * ONE_DAY)));
                score += recencyScore * 0.15; // Up to 0.15 boost for new items

                // --- Boost 2: Exact Keyword/Tag Match ---
                // Combine all text metadata for checking
                const allMetadataText = [
                    memory.content,
                    memory.aiMetadata.summary,
                    ...(memory.aiMetadata.topics || []),
                    ...(memory.aiMetadata.mood || [])
                ].join(' ').toLowerCase();

                // If explicit keyword match found in metadata
                if (allMetadataText.includes(lowerQ)) {
                    score += 0.25;
                }

                // If strict tag match
                const exactTags = [...(memory.aiMetadata.topics || []), ...(memory.aiMetadata.mood || [])].map(t => t.toLowerCase());
                if (exactTags.some(t => t === lowerQ)) {
                    score += 0.35;
                }

                return { ...memory, score };
            });
        }

        // Filter by threshold
        let finalResults = scoredResults
          .sort((a, b) => b.score - a.score)
          .filter(r => r.score > 0.40);

        // Fallback: If AI search returns nothing (or vector fails), try strict keyword search
        if (finalResults.length === 0) {
            const fallbackResults = memories.filter(m => {
                 const allText = [
                    m.content,
                    m.aiMetadata.summary,
                    ...(m.aiMetadata.topics || [])
                ].join(' ').toLowerCase();
                return allText.includes(lowerQ);
            }).map(m => ({ ...m, score: 0.5 })); // Artificial score
            
            finalResults = fallbackResults;
        }

        setSearchResults(finalResults);
      } catch (e) {
        console.error("Search failed", e);
      }
    };

    const timeoutId = setTimeout(performSearch, 500);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, memories]); 


  // 2. Save Logic
  const handleSave = async (file?: File) => {
    if ((!inputText.trim() && !file) || isProcessing) return;

    setIsProcessing(true);
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    let contentToAnalyze = inputText;
    let type: MemoryItem['type'] = 'note';
    let mediaData: { data: string, mimeType: string } | undefined = undefined;

    try {
        if (file) {
            const isPdf = file.type === 'application/pdf';
            type = isPdf ? 'pdf' : 'image';
            
            const base64Str = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(file);
            });

            mediaData = {
                data: base64Str,
                mimeType: file.type
            };
            
            contentToAnalyze = inputText || (isPdf ? `PDF Document: ${file.name}` : "Visual memory");
        } 
        else if (inputText.match(/^https?:\/\//)) {
            type = 'link';
        }

        const [metadata, embedding] = await Promise.all([
            analyzeContent(contentToAnalyze, mediaData, type),
            getEmbedding(contentToAnalyze) 
        ]);

        const refinedEmbedding = await getEmbedding(`${contentToAnalyze} ${metadata.summary} ${metadata.topics.join(' ')} ${metadata.mood.join(' ')}`);

        const newMemory: MemoryItem = {
            id,
            type,
            content: inputText || (type === 'pdf' && file ? file.name : (type === 'image' ? 'Image' : '')),
            imageData: mediaData?.data,
            aiMetadata: metadata,
            embedding: refinedEmbedding.length > 0 ? refinedEmbedding : embedding,
            createdAt,
            resurfaceCount: 0
        };

        // Find related memories and update connections
        const allMemories = await getAllMemories();
        const relatedIds = await findRelatedMemories(newMemory, allMemories);
        newMemory.aiMetadata.relatedMemoryIds = relatedIds;
        
        // Update related memories to include this one
        for (const relatedId of relatedIds) {
            const related = allMemories.find(m => m.id === relatedId);
            if (related) {
                const updatedRelated = {
                    ...related,
                    aiMetadata: {
                        ...related.aiMetadata,
                        relatedMemoryIds: [...(related.aiMetadata.relatedMemoryIds || []), id]
                    }
                };
                await saveMemory(updatedRelated);
            }
        }

        await saveMemory(newMemory);
        setInputText('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        await loadMemories();

    } catch (error) {
        console.error("Failed to save memory:", error);
        alert("Failed to analyze/save. Check API Key or connection.");
    } finally {
        setIsProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteMemory(id);
    if (selectedMemory?.id === id) setSelectedMemory(null);
    if (searchResults) {
        setSearchResults(prev => prev ? prev.filter(m => m.id !== id) : null);
    }
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  const handleUpdate = async (updatedItem: MemoryItem) => {
    await saveMemory(updatedItem); 
    setMemories(prev => prev.map(m => m.id === updatedItem.id ? updatedItem : m));
    if (selectedMemory?.id === updatedItem.id) {
        setSelectedMemory(updatedItem);
    }
  };

  // 3. Enhanced Resurface Feature with Contextual Intelligence
  const handleResurface = async () => {
    if (memories.length === 0) return;
    setIsResurfacing(true);
    setSearchQuery('');
    
    const now = Date.now();
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
    
    // Smart resurfacing: prioritize important memories that haven't been seen recently
    const candidates = memories.map(m => {
      const lastSeen = m.lastResurfaced || m.createdAt;
      const age = now - lastSeen;
      const importance = m.aiMetadata.importance || 0.5;
      const resurfaceCount = m.resurfaceCount || 0;
      
      // Score based on:
      // - Importance (higher = better)
      // - Time since last seen (longer = better, but not too old)
      // - Lower resurface count (show variety)
      let score = importance;
      
      if (age > ONE_WEEK && age < ONE_MONTH) {
        score += 0.3; // Sweet spot for resurfacing
      } else if (age > ONE_MONTH) {
        score += 0.2; // Old but still relevant
      }
      
      score -= resurfaceCount * 0.1; // Prefer less frequently shown
      
      return { memory: m, score };
    });
    
    // Sort by score and take top 3-5
    const selected = candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(c => {
        // Update resurface metadata
        const updated = {
          ...c.memory,
          lastResurfaced: now,
          resurfaceCount: (c.memory.resurfaceCount || 0) + 1
        };
        saveMemory(updated).catch(console.error);
        return updated;
      });
    
    setSearchResults(selected);
  };

  const clearResurface = () => {
    setIsResurfacing(false);
    setSearchResults(null);
  }

  // 4. Voice Input
  const toggleListening = () => {
    const w = window as unknown as IWindow;
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice input not supported in this browser.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputText(prev => prev + (prev ? ' ' : '') + transcript);
    };

    recognition.onend = () => setIsListening(false);
    
    recognition.onerror = (event: any) => {
      console.error("Speech error", event.error);
      setIsListening(false);
    };

    recognition.start();
  };


  const displayMemories = searchResults || memories;

  // Show loading screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-dark-bg flex flex-col items-center justify-center font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center"
        >
          <motion.img
            src="/onboarding_logo.jpg"
            alt="Memory"
            className="w-20 h-20 rounded-2xl shadow-lg mb-6"
            animate={{
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <div className="relative w-12 h-12">
            <motion.div
              className="absolute inset-0 border-4 border-orange-200 dark:border-orange-900/30 rounded-full"
            />
            <motion.div
              className="absolute inset-0 border-4 border-orange-500 border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "linear"
              }}
            />
          </div>
          <p className="mt-6 text-gray-500 dark:text-gray-400 text-sm font-medium">Loading your memories...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-dark-bg pb-20 font-sans text-apple-text dark:text-dark-text transition-colors duration-300">
      
      {/* Install Prompt Banner */}
      <AnimatePresence>
        {showInstallPrompt && !isInstalled && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-lg"
          >
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img 
                  src="/onboarding_logo.jpg" 
                  alt="Memory" 
                  className="w-8 h-8 rounded-lg"
                />
                <div>
                  <p className="font-semibold text-sm">Install Memory App</p>
                  <p className="text-xs opacity-90">
                    {deferredPrompt 
                      ? 'Get the full app experience' 
                      : 'Tap the share button and select "Add to Home Screen"'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {deferredPrompt ? (
                  <button
                    onClick={handleInstallClick}
                    className="px-4 py-2 bg-white text-orange-600 rounded-lg font-semibold text-sm hover:bg-gray-100 transition-colors"
                  >
                    Install
                  </button>
                ) : (
                  <button
                    onClick={() => setShowInstallPrompt(false)}
                    className="px-4 py-2 bg-white/20 text-white rounded-lg font-semibold text-sm hover:bg-white/30 transition-colors"
                  >
                    Got it
                  </button>
                )}
                <button
                  onClick={() => setShowInstallPrompt(false)}
                  className="px-3 py-2 text-white/80 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header & Search */}
      <header className={`sticky z-50 bg-[#f5f5f7]/80 dark:bg-dark-bg/80 backdrop-blur-xl border-b border-transparent transition-all ${showInstallPrompt && !isInstalled ? 'top-[73px] pt-6 pb-4' : 'top-0 pt-6 pb-4'} px-4 sm:px-8`}>
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Top Row: Logo and Actions */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="flex items-center gap-2 cursor-pointer" onClick={clearResurface}>
            <img 
              src="/onboarding_logo.jpg" 
              alt="Memory Logo" 
              className="w-8 h-8 rounded-lg shadow-sm object-cover"
            />
            <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white select-none">
              Memory
            </h1>
          </div>
            
            <div className="flex gap-2 items-center">
              {/* Install Button (if not installed and prompt available) */}
              {!isInstalled && deferredPrompt && (
                <button
                  onClick={handleInstallClick}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 text-white hover:from-orange-600 hover:to-pink-600 shadow-sm transition-all"
                  title="Install App"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </button>
              )}
              
              <button 
                onClick={handleResurface}
                className={`p-2.5 rounded-xl transition-all duration-300 shadow-sm ${isResurfacing ? 'bg-orange-100 text-orange-600 ring-2 ring-orange-500/20' : 'bg-white dark:bg-dark-card text-gray-400 hover:text-orange-500 hover:shadow-md'}`}
                title="Resurface forgotten memories"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </button>

              {/* Dark Mode Toggle */}
              <button
                  onClick={toggleTheme}
                  className="p-2.5 rounded-xl bg-white dark:bg-dark-card text-gray-400 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white shadow-sm transition-all"
                  title="Toggle Dark Mode"
              >
                  {theme === 'light' ? (
                     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                  ) : (
                     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  )}
              </button>
            </div>
          </div>

          {/* View Toggle */}
          <div className="flex gap-1 bg-white dark:bg-dark-card rounded-xl p-1 shadow-sm w-full sm:w-auto">
            <button
              onClick={() => { setActiveView('memories'); setSelectedCollection(null); setSearchResults(null); }}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeView === 'memories' 
                  ? 'bg-black dark:bg-white text-white dark:text-black' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Memories
            </button>
            <button
              onClick={() => { setActiveView('collections'); setSearchResults(null); }}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeView === 'collections' 
                  ? 'bg-black dark:bg-white text-white dark:text-black' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Collections
            </button>
            <button
              onClick={() => { setActiveView('insights'); setSearchResults(null); }}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeView === 'insights' 
                  ? 'bg-black dark:bg-white text-white dark:text-black' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Insights
            </button>
          </div>

          {/* Search Bar */}
          <div className="flex gap-2 w-full items-center">
            <div className="relative w-full md:w-96 group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400 dark:text-gray-500 group-focus-within:text-orange-500 transition-colors" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
                </div>
                <input
                type="text"
                className="block w-full pl-10 pr-3 py-2.5 border border-transparent bg-white dark:bg-dark-card dark:text-white shadow-sm rounded-xl leading-5 text-gray-900 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:bg-white dark:focus:bg-[#2c2c2e] focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all duration-200 sm:text-sm"
                placeholder="Search by topic, mood, or color..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8">
        
        {/* Input Area */}
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-12 relative z-20"
        >
            <div className={`
                relative bg-white/70 dark:bg-dark-card/70 backdrop-blur-xl rounded-[24px] shadow-soft dark:shadow-none border border-white/50 dark:border-white/10 p-2 transition-all duration-300
                ${isProcessing ? 'opacity-80 scale-[0.99]' : 'hover:shadow-hover dark:hover:bg-dark-card/90'}
            `}>
                <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={isProcessing ? "Analyzing & organizing..." : "Save a thought, link, image, or PDF..."}
                    className="w-full resize-none p-4 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 bg-transparent border-none focus:ring-0 text-[16px] leading-relaxed min-h-[80px]"
                    disabled={isProcessing}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSave();
                        }
                    }}
                />
                
                <div className="flex justify-between items-center px-2 pb-2">
                    <div className="flex gap-1">
                         <label className="p-2.5 text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-full cursor-pointer transition-colors" title="Add Image or PDF">
                            <input 
                                type="file" 
                                ref={fileInputRef}
                                className="hidden" 
                                accept="image/*,application/pdf"
                                onChange={(e) => {
                                    if(e.target.files?.[0]) handleSave(e.target.files[0]);
                                }}
                                disabled={isProcessing}
                            />
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        </label>
                        
                        <button 
                            onClick={toggleListening}
                            className={`p-2.5 rounded-full transition-all ${isListening ? 'text-red-500 bg-red-50 dark:bg-red-900/20 animate-pulse' : 'text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20'}`}
                            title="Voice Input"
                        >
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                        </button>
                    </div>

                    <button
                        onClick={() => handleSave()}
                        disabled={!inputText.trim() || isProcessing}
                        className={`
                            px-6 py-2.5 rounded-full font-semibold text-sm transition-all duration-300 transform
                            ${inputText.trim() || isProcessing 
                                ? 'bg-black dark:bg-white text-white dark:text-black shadow-lg hover:shadow-xl hover:scale-105 active:scale-95' 
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed'}
                        `}
                    >
                        {isProcessing ? 'Thinking...' : 'Save'}
                    </button>
                </div>

                {isProcessing && (
                    <div className="absolute inset-0 bg-white/60 dark:bg-black/60 backdrop-blur-[2px] rounded-[24px] flex items-center justify-center z-10">
                        <div className="flex flex-col items-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>

        {/* Resurface Banner */}
        <AnimatePresence>
            {isResurfacing && (
                <motion.div 
                    initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                    animate={{ height: 'auto', opacity: 1, marginBottom: 32 }}
                    exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                    className="overflow-hidden"
                >
                    <div className="flex items-center justify-between">
                         <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                            ✨ Resurfaced from the past
                         </h2>
                         <button onClick={clearResurface} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">Close</button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        {/* Collections View */}
        {activeView === 'collections' && (
          <div className="space-y-6">
            {collections.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
                className="text-center py-20 opacity-40 dark:opacity-30"
              >
                <div className="mx-auto w-20 h-20 bg-gray-200 dark:bg-gray-800 rounded-full mb-6 flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <p className="text-gray-500 dark:text-gray-400 font-medium text-lg">No collections yet.</p>
                <p className="text-gray-400 dark:text-gray-500 mt-2">Collections are automatically created as you save memories.</p>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {collections.map(collection => {
                  const collectionMemories = memories.filter(m => 
                    m.aiMetadata.collection === collection.name
                  );
                  return (
                    <motion.div
                      key={collection.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ y: -4 }}
                      onClick={() => {
                        setSelectedCollection(collection.name);
                        setActiveView('memories');
                        setSearchResults(collectionMemories);
                      }}
                      className="bg-white dark:bg-dark-card rounded-2xl p-6 shadow-soft hover:shadow-xl cursor-pointer transition-all border border-transparent dark:border-dark-border"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                          {collection.name}
                        </h3>
                        <span className="text-xs font-bold text-gray-400 dark:text-gray-600 bg-gray-100 dark:bg-dark-border px-2 py-1 rounded-full">
                          {collectionMemories.length}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2">
                        {collection.description || `${collectionMemories.length} memories organized here`}
                      </p>
                      {collectionMemories.length > 0 && (
                        <div className="flex -space-x-2">
                          {collectionMemories.slice(0, 4).map(m => (
                            <div key={m.id} className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 border-2 border-white dark:border-dark-card" />
                          ))}
                          {collectionMemories.length > 4 && (
                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-dark-card flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">
                              +{collectionMemories.length - 4}
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Insights View */}
        {activeView === 'insights' && (
          <div className="space-y-6">
            {insights.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
                className="text-center py-20 opacity-40 dark:opacity-30"
              >
                <div className="mx-auto w-20 h-20 bg-gray-200 dark:bg-gray-800 rounded-full mb-6 flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <p className="text-gray-500 dark:text-gray-400 font-medium text-lg">No insights yet.</p>
                <p className="text-gray-400 dark:text-gray-500 mt-2">Insights will appear as you save more memories.</p>
              </motion.div>
            ) : (
              <div className="space-y-4">
                {insights.map((insight, idx) => {
                  const insightMemories = memories.filter(m => insight.memoryIds.includes(m.id));
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      onClick={() => {
                        setSearchResults(insightMemories);
                        setActiveView('memories');
                      }}
                      className="bg-white dark:bg-dark-card rounded-2xl p-6 shadow-soft hover:shadow-xl cursor-pointer transition-all border border-transparent dark:border-dark-border"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {insight.type === 'pattern' && (
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                              </svg>
                            </div>
                          )}
                          {insight.type === 'reminder' && (
                            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                              <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                          )}
                          <div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                              {insight.title}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              {insight.description}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-gray-400 dark:text-gray-600 bg-gray-100 dark:bg-dark-border px-2 py-1 rounded-full">
                          {insightMemories.length} memories
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {activeView === 'memories' && displayMemories.length === 0 ? (
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
                className="text-center py-20 opacity-40 dark:opacity-30"
            >
                <div className="mx-auto w-20 h-20 bg-gray-200 dark:bg-gray-800 rounded-full mb-6 flex items-center justify-center">
                    <svg className="w-10 h-10 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <p className="text-gray-500 dark:text-gray-400 font-medium text-lg">Your mind is empty.</p>
                <p className="text-gray-400 dark:text-gray-500 mt-2">Save a thought, a color, or a dream.</p>
            </motion.div>
        ) : activeView === 'memories' ? (
            <motion.div layout className="columns-1 sm:columns-2 md:columns-3 gap-6 space-y-6 pb-20">
                {selectedCollection && (
                  <div className="col-span-full mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                      Collection: {selectedCollection}
                    </h2>
                    <button 
                      onClick={() => { setSelectedCollection(null); setSearchResults(null); }}
                      className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      View All
                    </button>
                  </div>
                )}
                <AnimatePresence>
                    {displayMemories.map(item => (
                        <MemoryCard 
                            key={item.id} 
                            item={item} 
                            onClick={setSelectedMemory}
                            onDelete={handleDelete} 
                        />
                    ))}
                </AnimatePresence>
            </motion.div>
        ) : null}
      </main>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedMemory && (
            <MemoryDetail 
                item={selectedMemory}
                allMemories={memories}
                onClose={() => setSelectedMemory(null)}
                onDelete={handleDelete}
                onUpdate={handleUpdate}
                onMemoryClick={setSelectedMemory}
            />
        )}
      </AnimatePresence>

    </div>
  );
};

export default App;