# ❓ Does AWS Amplify Cause EC2 Charges?

## ✅ Short Answer: **NO**

**AWS Amplify does NOT cause EC2 charges.** Your $44 EC2 bill is from leftover EC2 resources, not from Amplify.

---

## 🔍 How Amplify Works (No EC2 Required)

AWS Amplify is a **fully managed service** that does NOT use EC2 instances for hosting:

### What Amplify Actually Uses:
1. **CloudFront (CDN)** - For content delivery (billed under CloudFront)
2. **S3** - For static file hosting (billed under S3)
3. **Build Compute** - Uses managed build servers (billed under **"Amplify Build"**, NOT EC2)
4. **Lambda@Edge** - For edge functions if used (billed under Lambda)

### Amplify Billing:
- ✅ **Build minutes** → Billed as **"AWS Amplify"** (not EC2)
- ✅ **Hosting/storage** → Billed as **"AWS Amplify"** (not EC2)
- ✅ **Data transfer** → Billed as **"AWS Amplify"** (not EC2)
- ❌ **NOT billed under EC2**

---

## 💰 Amplify Pricing (Separate from EC2)

### Build & Deploy:
- **Free tier:** 1,000 build minutes/month
- **Standard instance:** $0.01/minute after free tier
- **Large instance:** $0.025/minute
- **XLarge instance:** $0.10/minute

### Hosting:
- **Free tier:** 5 GB storage + 15 GB data transfer/month
- **Storage:** $0.023/GB/month after free tier
- **Data transfer:** $0.15/GB after free tier

### Server-Side Rendering (SSR):
- **Free tier:** 500,000 requests + 100 GB-hours/month
- **Requests:** $0.30 per 1M requests after free tier
- **Duration:** $0.20 per GB-hour after free tier

**All of these are billed under "AWS Amplify" service, NOT "EC2 - Elastic Compute Cloud".**

---

## 🚨 Why You're Seeing EC2 Charges

Your $44 EC2 bill is **NOT from Amplify**. It's from leftover EC2 resources:

### Most Likely Causes:
1. **EBS Volumes** (detached or attached to stopped instances)
   - Cost: ~$0.08-0.10/GB/month
   - Example: 40GB = $4/month

2. **Elastic IPs** (unattached)
   - Cost: ~$3.65/month each
   - Example: 2 IPs = $7.30/month

3. **EBS Snapshots** (old backups)
   - Cost: ~$0.05/GB/month
   - Example: 200GB = $10/month

4. **Load Balancers** (unused)
   - Cost: ~$16-20/month
   - Example: 1 ALB = $18/month

5. **NAT Gateways** (unused)
   - Cost: ~$32/month + data transfer
   - Example: 1 NAT Gateway = $32/month

6. **Stopped EC2 Instances** (EBS volumes still charge)
   - Instance: $0/month
   - Attached volumes: Still charge!

---

## 🔍 How to Verify

### Check Your Billing:
1. Go to: https://console.aws.amazon.com/billing/
2. Click **"Cost Explorer"**
3. Filter by service:
   - **"AWS Amplify"** → This is your Amplify costs (should be low)
   - **"EC2 - Elastic Compute Cloud"** → This is your $44 bill (NOT from Amplify)

### Check Usage Types:
In Cost Explorer, group by **"Usage Type"** to see:
- `EBS:VolumeUsage` → EBS volumes
- `EBS:SnapshotUsage` → EBS snapshots
- `ElasticIP:Address` → Elastic IPs
- `LoadBalancerUsage` → Load balancers
- `NatGateway-Hours` → NAT Gateways

**None of these are from Amplify!**

---

## ✅ What to Do

### Step 1: Identify EC2 Resources
Run the diagnostic script:
```bash
./scripts/find-ec2-charges.sh
```

Or check manually:
- EC2 Console → **Volumes** (look for detached volumes)
- EC2 Console → **Elastic IPs** (look for unattached IPs)
- EC2 Console → **Snapshots** (check for old snapshots)
- EC2 Console → **Load Balancers** (check for unused LBs)
- VPC Console → **NAT Gateways** (check for unused NATs)

### Step 2: Clean Up
Delete the resources you don't need:
- Delete detached EBS volumes
- Release unattached Elastic IPs
- Delete old snapshots
- Delete unused load balancers
- Delete unused NAT Gateways
- Terminate stopped EC2 instances (if not needed)

### Step 3: Verify
- Check Cost Explorer next month
- EC2 charges should drop to $0
- Amplify charges should remain separate (and low)

---

## 📊 Example Billing Breakdown

### What You Should See:

| Service | Cost | Notes |
|---------|------|-------|
| **AWS Amplify** | $0-5/month | Build + hosting (free tier covers most) |
| **EC2 - Elastic Compute Cloud** | $44/month | ❌ **This is the problem!** |
| S3 | $0.50/month | Image storage (cheap) |
| DynamoDB | $1-2/month | Database (pay-per-use) |
| CloudFront | $0-1/month | CDN (if used) |

### After Cleanup:

| Service | Cost | Notes |
|---------|------|-------|
| **AWS Amplify** | $0-5/month | ✅ Same (not affected) |
| **EC2 - Elastic Compute Cloud** | $0/month | ✅ **Fixed!** |
| S3 | $0.50/month | ✅ Same |
| DynamoDB | $1-2/month | ✅ Same |
| CloudFront | $0-1/month | ✅ Same |

**Total savings: ~$44/month = $528/year!** 💰

---

## 🎯 Key Takeaways

1. ✅ **Amplify does NOT use EC2** for hosting
2. ✅ **Amplify charges are separate** from EC2 charges
3. ✅ **Your $44 EC2 bill is from leftover resources**, not Amplify
4. ✅ **Clean up EC2 resources** to eliminate the charges
5. ✅ **Amplify will continue working** after EC2 cleanup

---

## 📝 Related Guides

- [EC2-HIDDEN-CHARGES-GUIDE.md](./EC2-HIDDEN-CHARGES-GUIDE.md) - Detailed guide on hidden EC2 charges
- [EC2-CLEANUP-GUIDE.md](./EC2-CLEANUP-GUIDE.md) - Step-by-step cleanup instructions
- [scripts/find-ec2-charges.sh](./scripts/find-ec2-charges.sh) - Diagnostic script

---

## 🆘 Still Confused?

If you're still seeing EC2 charges after cleanup:

1. **Check Cost Explorer by Usage Type** - This shows exactly what's charging
2. **Check all AWS regions** - Resources might be in different regions
3. **Check for pending charges** - Some charges appear with a delay
4. **Contact AWS Support** - They can help identify hidden charges

**Remember:** Amplify and EC2 are completely separate services. Your EC2 charges are from leftover EC2 resources, not from Amplify!
