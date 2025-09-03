# 🚀 AWS Amplify Deployment Guide

## 🎯 **Fixed Deployment Setup**

I've fixed the deployment issues and created the proper setup for AWS Amplify.

## 📋 **Branch Structure:**

- **`main`** → Full MFTournament React app (for development)
- **`develop`** → Development branch (for testing)
- **`construction`** → Construction page (for production)

## 🚀 **AWS Amplify Setup:**

### **Option 1: Production with Construction Page (Recommended)**

1. **Go to AWS Amplify Console**: https://console.aws.amazon.com/amplify/
2. **Click "New app" → "Host web app"**
3. **Configure Production App**:
   - **App name**: `mftournament-prod`
   - **Repository**: `Slazhen/tournament`
   - **Branch**: `construction` ← **Use this branch for construction page**
   - **Build settings**: Use the `amplify.yml` file (auto-detected)
   - **Node.js version**: `18`

4. **Deploy**: Click "Save and deploy"
5. **Add Domain**: `myfootballtournament.com`

### **Option 2: Development App**

1. **Create another app**:
   - **App name**: `mftournament-dev`
   - **Repository**: `Slazhen/tournament`
   - **Branch**: `develop`
   - **Build settings**: Use the `amplify.yml` file
   - **Node.js version**: `18`

2. **Add Domain**: `dev.myfootballtournament.com`

## 🔧 **What I Fixed:**

1. **Added `amplify.yml`** - Proper build configuration
2. **Created `construction` branch** - Dedicated branch for construction page
3. **Tested build locally** - Confirmed it works
4. **Proper branch structure** - Clean separation of concerns

## 📋 **Build Configuration (amplify.yml):**

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - echo "Installing dependencies..."
        - npm ci
    build:
      commands:
        - echo "Building the React app..."
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

## 🎯 **Deployment Workflow:**

### **For Construction Page (Production):**
- Use `construction` branch
- Shows beautiful construction page with football stadium background
- Perfect for pre-launch

### **For Full App (When Ready):**
- Switch to `main` branch in Amplify
- Shows full MFTournament application

### **For Development:**
- Use `develop` branch
- Shows development version

## 🚨 **Common Issues Fixed:**

1. **Build Errors**: Added proper `amplify.yml` configuration
2. **Node.js Version**: Specified Node.js 18
3. **Dependencies**: Ensured all dependencies are installed
4. **Output Directory**: Correctly set to `dist`
5. **Branch Structure**: Clean separation for different environments

## ✅ **Ready to Deploy!**

Your repository is now properly configured for AWS Amplify deployment. The build should work without issues.

**Next Steps:**
1. Go to AWS Amplify Console
2. Create app with `construction` branch
3. Deploy and add your domain
4. Your construction page will be live! 🎉

## 🔄 **Switching Between Pages:**

### **To show construction page:**
```bash
git checkout construction
# Deploy this branch to Amplify
```

### **To show full app:**
```bash
git checkout main
# Deploy this branch to Amplify
```

**Your deployment issues should now be resolved!** 🚀
