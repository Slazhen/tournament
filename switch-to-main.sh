#!/bin/bash

# 🚀 Switch to Main App Script
# This script restores the main app from the construction page

echo "🚀 Switching to main app..."

# Restore the backed up index.html
if [ -f "index.html.backup" ]; then
    cp index.html.backup index.html
    echo "✅ Restored main app"
else
    echo "❌ No backup found. Creating new index.html..."
    cat > index.html << 'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MFTournament</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF
fi

# Commit and push changes
git add index.html
git commit -m "🚀 Switch to main app - MFTournament is live!"
git push origin main

echo "🎉 Main app is now live!"
echo "📋 To switch back to construction page, run: ./switch-to-construction.sh"
