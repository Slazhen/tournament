# 🔧 AWS Amplify Deployment Troubleshooting

## ✅ Fixed: Build Deployment Issues

### Issue: `prebuild` Script Conflict

**Problem:**
The `prebuild` script in `package.json` was deleting `node_modules` and `package-lock.json` before building, which conflicts with AWS Amplify's build process that uses `npm ci` (which requires `package-lock.json`).

**Solution:**
- Removed the `prebuild` script that was automatically running before `npm run build`
- Renamed it to `clean-install` so it can be run manually if needed for local development
- Amplify now uses `npm ci` directly in the `preBuild` phase, which is the correct approach

### Issue: SSM Secrets Warning

**Warning Message:**
```
!Failed to set up process.env.secrets
```

**What it means:**
AWS Amplify automatically tries to fetch secrets from AWS Systems Manager (SSM) Parameter Store at the path `/amplify/{app-id}/{branch}/`. This is an optional feature.

**Why it happens:**
- You're using environment variables directly in Amplify (which is fine!)
- SSM Parameter Store secrets are not configured (also fine if you don't need them)
- The Amplify service role may not have SSM permissions

**Is it a problem?**
❌ **No, this is just a warning.** The build will continue normally. You're using environment variables directly in Amplify's console, which is the recommended approach for most use cases.

**If you want to fix the warning (optional):**
1. Go to AWS Amplify Console → Your App → App settings → Environment variables
2. Make sure all your environment variables are set there (not in SSM)
3. The warning will still appear but won't affect your build

**If you want to use SSM instead:**
1. Create SSM parameters at path `/amplify/{app-id}/{branch}/`
2. Grant the Amplify service role permission to read SSM parameters
3. This is more complex and usually unnecessary

---

## 📋 Required Environment Variables

Make sure these are set in AWS Amplify Console → App settings → Environment variables:

```env
VITE_AWS_REGION=us-east-1
VITE_AWS_READONLY_ACCESS_KEY_ID=<your-readonly-key>
VITE_AWS_READONLY_SECRET_ACCESS_KEY=<your-readonly-secret>
VITE_AWS_WRITE_ACCESS_KEY_ID=<your-write-key>
VITE_AWS_WRITE_SECRET_ACCESS_KEY=<your-write-secret>
VITE_S3_BUCKET_NAME=football-tournaments-images
```

---

## 🚀 Build Process

The build now follows this clean process:

1. **preBuild phase:**
   - `npm ci` - Clean install using package-lock.json (fast and reliable)

2. **build phase:**
   - `npm run build` - Runs TypeScript compilation and Vite build
   - Outputs to `dist/` directory

3. **Deploy:**
   - Amplify automatically deploys the `dist/` directory

---

## 🐛 Common Issues

### Build fails with "Cannot find module"
- **Solution:** Make sure `package-lock.json` is committed to git
- **Solution:** Check that all dependencies are listed in `package.json`

### Build succeeds but app doesn't work
- **Check:** Environment variables are set correctly in Amplify console
- **Check:** Environment variable names start with `VITE_` (required for Vite)
- **Check:** Redeploy after adding/changing environment variables

### TypeScript errors during build
- **Solution:** Run `npm run build` locally first to catch errors
- **Solution:** Check `tsconfig.json` and `tsconfig.app.json` configuration

### Build is slow
- **Normal:** First build takes longer (no cache)
- **Faster:** Subsequent builds use cached `node_modules`
- **Tip:** The cache is configured in `amplify.yml`

---

## 📝 Next Steps

1. **Commit the changes:**
   ```bash
   git add package.json amplify.yml
   git commit -m "fix: Remove prebuild script that conflicts with Amplify builds"
   git push
   ```

2. **Redeploy in Amplify:**
   - The build should now work correctly
   - The SSM warning will still appear but can be ignored

3. **Monitor the build:**
   - Check Amplify console for build logs
   - Verify the build completes successfully
   - Test your deployed application

---

## ✅ Verification Checklist

- [ ] `package.json` no longer has `prebuild` script
- [ ] `amplify.yml` uses `npm ci` in preBuild phase
- [ ] All environment variables are set in Amplify console
- [ ] `package-lock.json` is committed to git
- [ ] Build completes successfully
- [ ] Application works correctly after deployment



