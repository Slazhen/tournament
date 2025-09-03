#!/bin/bash

# 🚧 Switch to Construction Page Script
# This script temporarily replaces the main app with the construction page

echo "🚧 Switching to construction page..."

# Backup the current index.html
if [ -f "index.html" ]; then
    cp index.html index.html.backup
    echo "✅ Backed up current index.html"
fi

# Copy construction page to index.html
cp public/under-construction.html index.html
echo "✅ Switched to construction page"

# Commit and push changes
git add index.html
git commit -m "🚧 Switch to construction page for production launch"
git push origin main

echo "🎉 Construction page is now live!"
echo "📋 To switch back to main app, run: ./switch-to-main.sh"
