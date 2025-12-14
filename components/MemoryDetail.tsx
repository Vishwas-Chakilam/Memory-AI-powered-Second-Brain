import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MemoryItem } from '../types';

interface MemoryDetailProps {
  item: MemoryItem;
  allMemories?: MemoryItem[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdate: (item: MemoryItem) => void;
  onMemoryClick?: (item: MemoryItem) => void;
}

export const MemoryDetail: React.FC<MemoryDetailProps> = ({ item, allMemories = [], onClose, onDelete, onUpdate, onMemoryClick }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState(item.aiMetadata.summary);
  const [newTopic, setNewTopic] = useState('');

  const handleSave = () => {
    onUpdate({
      ...item,
      aiMetadata: {
        ...item.aiMetadata,
        summary: editedSummary,
      }
    });
    setIsEditing(false);
  };

  const removeTopic = (topic: string) => {
    const updatedTopics = item.aiMetadata.topics.filter(t => t !== topic);
    onUpdate({
      ...item,
      aiMetadata: { ...item.aiMetadata, topics: updatedTopics }
    });
  };

  const addTopic = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTopic.trim()) {
      if (!item.aiMetadata.topics.includes(newTopic.trim())) {
        onUpdate({
          ...item,
          aiMetadata: { ...item.aiMetadata, topics: [...item.aiMetadata.topics, newTopic.trim()] }
        });
      }
      setNewTopic('');
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(item.content);
  };

  const isImage = item.type === 'image' && item.imageData;
  const isPdf = item.type === 'pdf';
  const isLink = item.type === 'link';

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-white/60 dark:bg-black/60 backdrop-blur-xl"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="bg-white dark:bg-dark-card w-full max-w-5xl h-[85vh] rounded-3xl shadow-2xl border border-gray-100 dark:border-dark-border overflow-hidden flex flex-col md:flex-row relative"
        onClick={e => e.stopPropagation()}
      >
        {/* Close Button */}
        <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 bg-white/80 dark:bg-black/50 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
          <svg className="w-6 h-6 text-gray-500 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Left Side: Content Preview */}
        <div className="w-full md:w-3/5 bg-gray-50 dark:bg-black/40 flex items-center justify-center relative overflow-hidden">
          {isImage ? (
             <div className="w-full h-full overflow-y-auto custom-scrollbar flex items-center justify-center p-4">
               <img src={item.imageData} alt="Memory" className="max-w-full max-h-full object-contain shadow-sm" />
             </div>
          ) : isPdf ? (
            <div className="w-full h-full flex flex-col">
               {item.imageData ? (
                 <iframe 
                    src={`${item.imageData}#toolbar=0&view=FitH`} 
                    className="w-full h-full border-0" 
                    title="PDF Preview"
                 />
               ) : (
                 <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <p>PDF Content Unavailable</p>
                 </div>
               )}
            </div>
          ) : (
             <div className="p-10 w-full h-full max-w-2xl overflow-y-auto custom-scrollbar flex items-center justify-center">
                {isLink ? (
                  <div className="text-center">
                    <a href={item.content} target="_blank" rel="noopener noreferrer" className="text-3xl font-bold text-blue-600 dark:text-blue-400 hover:underline break-words">
                      {item.content}
                    </a>
                    <div className="mt-8 text-left prose prose-lg dark:prose-invert text-gray-600 dark:text-gray-300">
                         <h3 className="text-sm uppercase tracking-wide text-gray-400 font-semibold mb-2">Analysis</h3>
                         <p>{item.aiMetadata.summary}</p>
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-xl dark:prose-invert text-gray-800 dark:text-gray-100 whitespace-pre-wrap font-serif leading-loose">
                    {item.content}
                  </div>
                )}
             </div>
          )}
        </div>

        {/* Right Side: Metadata & Intelligence */}
        <div className="w-full md:w-2/5 p-8 flex flex-col h-full bg-white dark:bg-dark-card overflow-y-auto border-l border-gray-100 dark:border-dark-border">
           
           <div className="flex-1">
             <div className="flex items-center justify-between mb-6">
               <span className="text-xs font-bold tracking-widest uppercase text-gray-400 dark:text-gray-500">
                 {new Date(item.createdAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
               </span>
               <div className="flex gap-2">
                 <button onClick={copyToClipboard} className="p-2 text-gray-400 hover:text-blue-500 transition-colors" title="Copy content">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                 </button>
               </div>
             </div>

             {/* Summary Section */}
             <div className="mb-8">
               <div className="flex justify-between items-baseline mb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white">AI Summary</h3>
                  {!isEditing ? (
                    <button onClick={() => setIsEditing(true)} className="text-xs text-orange-500 hover:text-orange-600 font-medium">Edit</button>
                  ) : (
                    <button onClick={handleSave} className="text-xs text-green-600 font-medium">Save</button>
                  )}
               </div>
               
               {isEditing ? (
                 <textarea 
                   value={editedSummary}
                   onChange={(e) => setEditedSummary(e.target.value)}
                   className="w-full p-3 bg-gray-50 dark:bg-black/30 rounded-lg text-sm text-gray-700 dark:text-gray-200 border-transparent focus:border-orange-500 focus:ring-0 transition-colors h-32 resize-none"
                 />
               ) : (
                 <p className="text-gray-600 dark:text-gray-300 leading-relaxed font-serif text-lg italic border-l-2 border-orange-200 dark:border-orange-900/50 pl-4">
                   {item.aiMetadata.summary}
                 </p>
               )}
             </div>

             {/* Moods */}
             <div className="mb-8">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-3">Vibe check</h3>
                <div className="flex flex-wrap gap-2">
                  {item.aiMetadata.mood?.map(m => (
                    <span key={m} className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-semibold rounded-full uppercase tracking-wide">
                      {m}
                    </span>
                  ))}
                </div>
             </div>

             {/* Colors */}
             {item.aiMetadata.colors?.length > 0 && (
               <div className="mb-8">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-3">Palette</h3>
                  <div className="flex gap-3">
                    {item.aiMetadata.colors.map(c => (
                      <div key={c} className="group relative">
                        <div className="w-10 h-10 rounded-full shadow-sm ring-1 ring-black/5 dark:ring-white/10 cursor-pointer hover:scale-110 transition-transform" style={{ backgroundColor: c }}></div>
                        <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] bg-black text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                          {c}
                        </span>
                      </div>
                    ))}
                  </div>
               </div>
             )}

             {/* Topics (Editable) */}
             <div className="mb-8">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-3">Tags & Topics</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {item.aiMetadata.topics?.map(t => (
                    <span key={t} className="group px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm font-medium rounded-lg flex items-center gap-1 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-default">
                      {t}
                      <button onClick={() => removeTopic(t)} className="opacity-0 group-hover:opacity-100 ml-1">×</button>
                    </span>
                  ))}
                </div>
                <input 
                  type="text" 
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  onKeyDown={addTopic}
                  placeholder="+ Add tag..."
                  className="w-full bg-transparent border-b border-gray-200 dark:border-dark-border py-2 text-sm text-gray-800 dark:text-gray-200 focus:border-blue-500 focus:outline-none transition-colors placeholder-gray-400"
                />
             </div>

             {/* Related Memories */}
             {item.aiMetadata.relatedMemoryIds && item.aiMetadata.relatedMemoryIds.length > 0 && (
               <div className="mb-8">
                 <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-3">Connected Memories</h3>
                 <div className="space-y-2">
                   {item.aiMetadata.relatedMemoryIds.map(relatedId => {
                     const related = allMemories.find(m => m.id === relatedId);
                     if (!related) return null;
                     return (
                       <div
                         key={relatedId}
                         onClick={() => {
                           if (onMemoryClick) {
                             onMemoryClick(related);
                             onClose();
                           }
                         }}
                         className="p-3 bg-gray-50 dark:bg-black/30 rounded-lg hover:bg-gray-100 dark:hover:bg-black/50 cursor-pointer transition-colors border border-transparent hover:border-gray-200 dark:hover:border-dark-border"
                       >
                         <div className="flex items-start justify-between">
                           <div className="flex-1 min-w-0">
                             <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                               {related.content.substring(0, 60)}{related.content.length > 60 ? '...' : ''}
                             </p>
                             <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                               {related.aiMetadata.summary}
                             </p>
                           </div>
                           <div className="flex gap-1 ml-2 flex-shrink-0">
                             {related.aiMetadata.topics.slice(0, 2).map(t => (
                               <span key={t} className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                                 {t}
                               </span>
                             ))}
                           </div>
                         </div>
                       </div>
                     );
                   })}
                 </div>
               </div>
             )}

             {/* Collection */}
             {item.aiMetadata.collection && (
               <div className="mb-8">
                 <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-3">Collection</h3>
                 <span className="inline-block px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-sm font-medium rounded-lg">
                   {item.aiMetadata.collection}
                 </span>
               </div>
             )}
           </div>

           {/* Delete Zone */}
           <div className="pt-6 border-t border-gray-100 dark:border-dark-border mt-auto">
             <button 
               onClick={() => onDelete(item.id)} 
               className="w-full py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-colors text-sm font-semibold flex items-center justify-center gap-2"
             >
               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
               Delete Memory
             </button>
           </div>

        </div>
      </motion.div>
    </motion.div>
  );
};