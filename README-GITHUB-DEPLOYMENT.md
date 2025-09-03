# 🚀 GitHub-Integrated AWS Deployment Guide

This guide shows you how to deploy your Football Tournaments app to AWS with full GitHub integration for continuous deployment.

## 📋 Prerequisites

1. **AWS Account** with billing enabled
2. **Domain registered** at `myfootballtournament.com`
3. **AWS CLI installed** and configured
4. **Docker installed** locally
5. **GitHub repository** (already set up!)

## 🔄 GitHub Integration Benefits

- ✅ **Version Control**: All changes tracked in GitHub
- ✅ **Automated Deployment**: Push to GitHub = automatic deployment
- ✅ **Rollback Capability**: Easy to revert to previous versions
- ✅ **Collaboration**: Multiple developers can work together
- ✅ **CI/CD Pipeline**: Automated testing and deployment
- ✅ **Backup**: Your code is safely stored in GitHub

---

## **🚀 Step 1: Set Up AWS CLI**

```bash
# Install AWS CLI (if not already installed)
# macOS
brew install awscli

# Configure AWS credentials
aws configure
# Enter your Access Key ID, Secret Access Key, and region (us-east-1)
```

---

## **🌐 Step 2: Create Domain Infrastructure**

```bash
# Make the script executable
chmod +x deploy-domain.sh

# Run the domain deployment script
./deploy-domain.sh
```

**What this does:**
- ✅ Creates Route 53 hosted zone for `myfootballtournament.com`
- ✅ Creates separate DynamoDB tables for prod and dev
- ✅ Creates separate S3 buckets for prod and dev
- ✅ Builds Docker images for both environments
- ✅ Requests SSL certificates
- ✅ Creates environment configurations

---

## **🖥️ Step 3: Launch EC2 Instances**

### **Option A: Separate Instances (Recommended)**

**Launch Production Instance:**
```bash
aws ec2 run-instances \
    --image-id ami-0c02fb55956c7d316 \
    --count 1 \
    --instance-type t3.micro \
    --key-name YOUR_KEY_PAIR \
    --security-groups football-tournaments-sg \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=football-tournaments-prod}]'
```

**Launch Development Instance:**
```bash
aws ec2 run-instances \
    --image-id ami-0c02fb55956c7d316 \
    --count 1 \
    --instance-type t3.micro \
    --key-name YOUR_KEY_PAIR \
    --security-groups football-tournaments-sg \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=football-tournaments-dev}]'
```

---

## **📦 Step 4: Deploy to EC2 with GitHub Integration**

### **For Production Instance:**
```bash
# Copy GitHub deployment script to EC2
scp -i your-key.pem deploy-from-github.sh ec2-user@PROD_EC2_IP:~/

# SSH into EC2 and run setup
ssh -i your-key.pem ec2-user@PROD_EC2_IP
chmod +x deploy-from-github.sh
./deploy-from-github.sh
# Choose option 1 (Setup GitHub deployment) when prompted
# Then choose option 2 (Deploy production environment)
```

### **For Development Instance:**
```bash
# Copy GitHub deployment script to EC2
scp -i your-key.pem deploy-from-github.sh ec2-user@DEV_EC2_IP:~/

# SSH into EC2 and run setup
ssh -i your-key.pem ec2-user@DEV_EC2_IP
chmod +x deploy-from-github.sh
./deploy-from-github.sh
# Choose option 1 (Setup GitHub deployment) when prompted
# Then choose option 3 (Deploy development environment)
```

---

## **🌐 Step 5: Set Up DNS Records**

```bash
# Make the script executable
chmod +x setup-route53.sh

# Run the DNS setup script
./setup-route53.sh
# Choose option 3 (Both domains) when prompted
```

---

## **🔒 Step 6: Get SSL Certificates**

### **On Production EC2:**
```bash
ssh -i your-key.pem ec2-user@PROD_EC2_IP
sudo certbot --nginx -d myfootballtournament.com -d www.myfootballtournament.com
```

### **On Development EC2:**
```bash
ssh -i your-key.pem ec2-user@DEV_EC2_IP
sudo certbot --nginx -d dev.myfootballtournament.com
```

---

## **🔄 Step 7: Set Up GitHub Actions (Optional)**

### **Add GitHub Secrets:**
1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Add these secrets:
   - `AWS_ACCESS_KEY_ID`: Your AWS access key
   - `AWS_SECRET_ACCESS_KEY`: Your AWS secret key
   - `EC2_SSH_KEY`: Your EC2 private key (for automated deployment)

### **GitHub Actions will automatically:**
- ✅ Build and test your code
- ✅ Create Docker images
- ✅ Push to AWS ECR
- ✅ Deploy to EC2 instances
- ✅ Run on every push to main branch

---

## **🚀 Step 8: Deploy Applications**

### **Deploy Production:**
```bash
ssh -i your-key.pem ec2-user@PROD_EC2_IP
cd /home/ec2-user/football-tournaments-prod
./deploy-from-github.sh
```

### **Deploy Development:**
```bash
ssh -i your-key.pem ec2-user@DEV_EC2_IP
cd /home/ec2-user/football-tournaments-dev
./deploy-from-github.sh
```

---

## **🎯 Step 9: Update Domain Registrar**

**IMPORTANT:** You need to update your domain registrar with the Route 53 name servers.

1. **Get the name servers** from the `deploy-domain.sh` output
2. **Go to your domain registrar** (where you bought `myfootballtournament.com`)
3. **Update the name servers** to the ones provided by Route 53
4. **Wait 5-10 minutes** for DNS propagation

---

## **🔄 Step 10: Continuous Deployment Workflow**

### **Making Changes:**
1. **Make changes** to your code locally
2. **Test changes** locally
3. **Commit changes** to Git
4. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Description of changes"
   git push origin main
   ```
5. **Automatic deployment** happens via GitHub Actions

### **Manual Deployment:**
```bash
# On EC2 instance
./deploy-from-github.sh
```

### **Rollback to Previous Version:**
```bash
# On EC2 instance
git log --oneline  # Find the commit you want to rollback to
git checkout <commit-hash>
docker-compose down
docker-compose up -d
```

---

## **✅ Step 11: Verify Everything Works**

### **Check Your Applications:**
- **Production**: https://myfootballtournament.com
- **Development**: https://dev.myfootballtournament.com

### **Test SSL Certificates:**
```bash
curl -I https://myfootballtournament.com
curl -I https://dev.myfootballtournament.com
```

### **Check GitHub Actions:**
- Go to your GitHub repository
- Click **Actions** tab
- Verify deployments are successful

---

## **📊 What You'll Have After This**

### **AWS Resources Created:**
- ✅ **Route 53**: Hosted zone for your domain
- ✅ **DynamoDB**: 10 tables (5 for prod, 5 for dev)
- ✅ **S3**: 2 buckets (1 for prod, 1 for dev)
- ✅ **EC2**: 2 instances (1 for prod, 1 for dev)
- ✅ **ECR**: Docker image repositories
- ✅ **SSL Certificates**: For both domains

### **GitHub Integration:**
- ✅ **Version Control**: All code changes tracked
- ✅ **Automated Deployment**: Push to GitHub = deploy
- ✅ **CI/CD Pipeline**: Automated testing and deployment
- ✅ **Rollback Capability**: Easy to revert changes
- ✅ **Collaboration**: Multiple developers can work together

### **Applications Running:**
- ✅ **Production**: https://myfootballtournament.com
- ✅ **Development**: https://dev.myfootballtournament.com
- ✅ **Separate databases** for each environment
- ✅ **Separate image storage** for each environment
- ✅ **Automatic SSL renewal**

---

## **💰 Total Cost**
- **EC2 (2 instances)**: ~$17/month
- **DynamoDB**: ~$2-10/month
- **S3**: ~$2-6/month
- **Route 53**: ~$0.50/month
- **ECR**: ~$1-3/month
- **SSL**: Free
- **Total**: ~$20-40/month

---

## **🔄 Daily Workflow**

### **Making Changes:**
1. **Edit code** locally
2. **Test locally**: `npm run dev`
3. **Commit changes**: `git add . && git commit -m "Description"`
4. **Push to GitHub**: `git push origin main`
5. **Automatic deployment** happens via GitHub Actions

### **Monitoring:**
- **Check GitHub Actions**: Repository → Actions tab
- **Check application logs**: `docker logs football-tournaments-prod`
- **Check application status**: `docker ps`

---

## **🆘 Troubleshooting**

### **Common Issues:**

1. **GitHub Actions failing**:
   - Check AWS credentials in GitHub Secrets
   - Verify EC2 instances are running
   - Check GitHub Actions logs

2. **Deployment not working**:
   - Check EC2 instance status
   - Verify Docker containers are running
   - Check application logs

3. **Domain not resolving**:
   - Check Route 53 DNS records
   - Verify domain registrar name servers
   - Wait for DNS propagation

### **Useful Commands:**

```bash
# Check GitHub Actions status
gh run list

# Check EC2 instance status
aws ec2 describe-instances --filters "Name=tag:Name,Values=football-tournaments-prod"

# Check Docker containers
docker ps
docker logs football-tournaments-prod

# Check application status
curl -I https://myfootballtournament.com
```

---

## **🎉 Success!**

After following these steps, you'll have:
- ✅ Professional football tournament platform
- ✅ Custom domain with SSL
- ✅ Separate production and development environments
- ✅ Scalable AWS infrastructure
- ✅ GitHub-integrated continuous deployment
- ✅ Automatic SSL renewal
- ✅ Professional hosting with version control

Your app will be live at:
- **Production**: https://myfootballtournament.com
- **Development**: https://dev.myfootballtournament.com

**Every time you push to GitHub, your app will automatically deploy!** 🚀⚽🏆🌐

---

## **📞 Support**

If you encounter any issues:
1. Check the troubleshooting section above
2. Review GitHub Actions logs
3. Check AWS CloudWatch logs
4. Check Docker container logs
5. Verify AWS service status

Happy deploying with GitHub integration! 🚀⚽🏆🌐
