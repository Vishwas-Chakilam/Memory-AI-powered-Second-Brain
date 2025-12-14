<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Memory - Your Second Brain

A Progressive Web App (PWA) that uses Google Gemini AI to act as your second brain, automatically organizing information just like mymind.

**Created by:** [Vishwas Chakilam](https://github.com/vishwas-chakilam)  
**Email:** vishwas.chakilam@gmail.com

## Features

- 🤖 **AI-Powered Organization**: Automatically categorizes and tags your memories
- 🔗 **Smart Connections**: Finds and links related memories
- 📁 **Auto Collections**: Groups memories into meaningful collections
- 💡 **Insights**: Discovers patterns and resurfaces important memories
- 🔍 **Semantic Search**: Find memories by meaning, not just keywords
- 📱 **Installable PWA**: Install as a native app on any device

## Installation

### Install as App

**On Android/Chrome:**
1. Visit the app in your browser
2. Look for the install prompt banner or click the install button in the header
3. Tap "Install" when prompted
4. The app will be added to your home screen and work like a native app

**On iOS/Safari:**
1. Visit the app in Safari
2. Tap the Share button (square with arrow)
3. Select "Add to Home Screen"
4. The app will appear on your home screen

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set the `GEMINI_API_KEY` in `.env.local` to your Gemini API key:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

3. Run the app:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

## PWA Features

- ✅ **Offline Support**: Works offline using IndexedDB and service workers
- ✅ **App-like Experience**: Standalone display mode (no browser UI)
- ✅ **Fast Loading**: Cached resources for instant startup
- ✅ **Installable**: Can be installed on any device

## Tech Stack

- React 19
- TypeScript
- Google Gemini AI
- IndexedDB (local storage)
- Service Workers (PWA)
- Framer Motion (animations)
