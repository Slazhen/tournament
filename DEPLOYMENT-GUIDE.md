# 🚀 MFTournament Deployment Guide

## 🌳 Branch Structure

You now have a proper two-branch setup:

- **`main`** → Production branch (stable, ready for production)
- **`develop`** → Development branch (for testing and integration)

## 🔄 Development Workflow

### **For Development Work:**
```bash
# Switch to development branch
git checkout develop

# Make your changes
# ... edit files ...

# Commit changes
git add .
git commit -m "Add new feature: tournament brackets"

# Push to development
git push origin develop
```

### **For Production Deployment:**
```bash
# Switch to main branch
git checkout main

# Merge development changes
git merge develop

# Push to production
git push origin main
```

## 🎯 **Recommended Setup for Two Instances:**

### **Option 1: Branch-Based Deployment**
- **Production Instance** → Deploy from `main` branch
- **Development Instance** → Deploy from `develop` branch

### **Option 2: Environment-Based Deployment**
- **Production Instance** → Deploy from `main` branch
- **Development Instance** → Deploy from `main` branch with dev environment variables

## 📋 **Quick Commands:**

### **Start Development:**
```bash
git checkout develop
npm run dev
```

### **Deploy to Production:**
```bash
git checkout main
git merge develop
git push origin main
```

### **Create Feature Branch:**
```bash
git checkout develop
git checkout -b feature/new-tournament-type
# ... make changes ...
git add .
git commit -m "Add new tournament type"
git push origin feature/new-tournament-type
```

## 🔧 **Current Status:**
- ✅ **main** branch: Production-ready code
- ✅ **develop** branch: Development code
- ✅ **Local server**: Running on http://localhost:5173/

## 🎉 **You're all set!**

Your repository now follows Git best practices with proper branch separation for production and development environments.
