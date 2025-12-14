import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MemoryItem } from '../types';

interface MemoryCardProps {
  item: MemoryItem;
  onClick: (item: MemoryItem) => void;
  onDelete: (id: string) => void;
}

export const MemoryCard: React.FC<MemoryCardProps> = ({ item, onClick, onDelete }) => {
  const [isConfirming, setIsConfirming] = useState(false);

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return 'link';
    }
  };

  const isLink = item.type === 'link';
  const hasImage = item.type === 'image' && !!item.imageData;
  const isPdf = item.type === 'pdf';

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isConfirming) {
      onDelete(item.id);
    } else {
      setIsConfirming(true);
      setTimeout(() => setIsConfirming(false), 3000);
    }
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      whileHover={{ y: -6, transition: { duration: 0.2 } }}
      onClick={() => onClick(item)}
      className="break-inside-avoid mb-6 relative group rounded-[20px] bg-white dark:bg-dark-card shadow-soft hover:shadow-xl dark:shadow-none dark:hover:bg-[#2c2c2e] overflow-hidden transition-all duration-300 cursor-pointer border border-transparent dark:border-dark-border"
    >
      {/* Image Header */}
      {hasImage && (
        <div className="w-full relative overflow-hidden">
          <img 
            src={item.imageData} 
            alt="Memory" 
            className="w-full h-auto object-cover max-h-[400px] transition-transform duration-700 ease-out group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          <div className="absolute bottom-3 right-3 flex -space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-100">
            {item.aiMetadata.colors.slice(0, 4).map((color, idx) => (
              <div 
                key={idx} 
                className="w-6 h-6 rounded-full border-2 border-white dark:border-dark-card shadow-md" 
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      )}

      {/* PDF Header */}
      {isPdf && (
         <div className="w-full h-48 bg-gray-50 dark:bg-gray-800 flex items-center justify-center relative overflow-hidden group-hover:bg-gray-100 dark:group-hover:bg-gray-700 transition-colors">
            <div className="text-red-500 scale-150 transform transition-transform duration-500 group-hover:scale-[1.8] group-hover:rotate-3">
               <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24"><path d="M7 18h2v-2h-2v2zm4 0h2v-2h-2v2zm4 0h2v-2h-2v2zm2-17h-12a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-16l-6-4zm-1 18h-12v-16h10v4h4v12zm-3.5-7h-8v-2h8v2z"/></svg>
            </div>
            <div className="absolute top-3 right-3 px-2.5 py-1 bg-white/90 dark:bg-black/50 backdrop-blur text-[10px] font-extrabold uppercase text-red-500 dark:text-red-400 rounded-lg shadow-sm">
                PDF
            </div>
         </div>
      )}

      <div className="p-6">
        {/* Metadata Badges - Icons + Pills */}
        <div className="flex flex-wrap gap-2 mb-4">
          {item.aiMetadata.mood.slice(0, 1).map((m) => (
            <span key={m} className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-300"></span>
              {m}
            </span>
          ))}
          {item.aiMetadata.topics.slice(0, 2).map((t) => (
            <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-full">
              {t}
            </span>
          ))}
        </div>

        {/* Content */}
        <div className="text-gray-900 dark:text-gray-100 text-[15px] leading-relaxed font-medium mb-4 line-clamp-6">
            {isLink ? (
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 break-all group-hover:underline">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                    <span>{item.content}</span>
                </div>
            ) : (
                item.content
            )}
        </div>

        {/* AI Summary */}
        <div className="pt-4 border-t border-gray-100 dark:border-dark-border">
          <p className="text-xs text-gray-500 dark:text-dark-subtext font-serif italic leading-relaxed">
            {item.aiMetadata.summary}
          </p>
        </div>

        {/* Footer info */}
        <div className="mt-5 flex justify-between items-center text-[10px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-widest">
           <span>{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
           {isLink && <span className="bg-gray-100 dark:bg-dark-border px-2 py-1 rounded text-gray-500 dark:text-gray-400">{getDomain(item.content)}</span>}
           {isPdf && <span className="text-red-400 dark:text-red-400/80">Document</span>}
        </div>
      </div>

      {/* Two-Step Delete Action */}
      <motion.button 
        onClick={handleDeleteClick}
        initial={false}
        animate={{ 
          width: isConfirming ? 80 : 32,
          backgroundColor: isConfirming ? '#EF4444' : 'var(--bg-overlay, rgba(255, 255, 255, 0.9))',
          color: isConfirming ? '#FFFFFF' : '#EF4444'
        }}
        className={`absolute top-3 right-3 h-8 flex items-center justify-center rounded-full shadow-lg border border-gray-100 dark:border-dark-border z-20 
                   transition-all duration-300 cursor-pointer overflow-hidden backdrop-blur-md dark:bg-black/50
                   ${isConfirming ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:translate-y-2 sm:group-hover:translate-y-0'}
                   `}
        title={isConfirming ? "Confirm Delete" : "Delete memory"}
      >
        <AnimatePresence mode="wait">
          {isConfirming ? (
            <motion.span 
              key="confirm"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap px-2"
            >
              Confirm
            </motion.span>
          ) : (
            <motion.svg 
              key="trash"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="w-4 h-4 min-w-[16px]" 
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </motion.svg>
          )}
        </AnimatePresence>
      </motion.button>
    </motion.div>
  );
};