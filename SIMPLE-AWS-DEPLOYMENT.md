# 🚀 SIMPLE AWS Deployment Guide

## 🎯 **Option 1: AWS Amplify (RECOMMENDED - Easiest)**

### **Why Amplify?**
- ✅ **No server management** - AWS handles everything
- ✅ **Automatic deployments** from GitHub
- ✅ **Built-in HTTPS** with your certificates
- ✅ **Automatic scaling**
- ✅ **5-minute setup**

### **Steps:**

1. **Go to AWS Amplify Console**
   - Visit: https://console.aws.amazon.com/amplify/
   - Click "New app" → "Host web app"

2. **Connect GitHub**
   - Select your repository: `Slazhen/tournament`
   - Choose branch: `main` (for production)

3. **Configure Build Settings**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Node.js version: `18`

4. **Add Environment Variables** (if needed)
   - Add any environment variables your app needs

5. **Deploy**
   - Click "Save and deploy"
   - Wait 5-10 minutes
   - Your app will be live!

6. **Custom Domain**
   - Go to "Domain management"
   - Add your domain
   - Use your existing certificates

---

## 🎯 **Option 2: EC2 + Nginx (More Control)**

### **Why EC2?**
- ✅ **Full control** over server
- ✅ **Use your existing certificates**
- ✅ **Custom configurations**

### **Steps:**

1. **Launch EC2 Instance**
   - Go to: https://console.aws.amazon.com/ec2/
   - Launch instance: Amazon Linux 2, t2.micro
   - Security group: HTTP (80), HTTPS (443), SSH (22)

2. **Connect to Instance**
   - Use EC2 Instance Connect
   - Or SSH with key pair

3. **Run This Script** (copy-paste):
```bash
# Update system
sudo yum update -y

# Install Node.js 18
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install Nginx
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Install Git
sudo yum install -y git

# Clone your app
git clone https://github.com/Slazhen/tournament.git /var/www/html/app
cd /var/www/html/app

# Install dependencies and build
npm ci
npm run build

# Configure Nginx
sudo tee /etc/nginx/conf.d/mftournament.conf > /dev/null << 'EOF'
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/html/app/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

# Restart Nginx
sudo systemctl restart nginx

# Configure firewall
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

4. **Add Your SSL Certificate**
   - Upload your certificate files to `/etc/ssl/`
   - Update Nginx config to use HTTPS

---

## 🎯 **Option 3: AWS S3 + CloudFront (Static Hosting)**

### **Why S3 + CloudFront?**
- ✅ **Cheapest option**
- ✅ **Global CDN**
- ✅ **Automatic HTTPS**

### **Steps:**

1. **Build Your App Locally**
```bash
npm run build
```

2. **Upload to S3**
   - Create S3 bucket
   - Enable static website hosting
   - Upload `dist/` folder contents

3. **Setup CloudFront**
   - Create CloudFront distribution
   - Point to S3 bucket
   - Add your custom domain
   - Use your SSL certificate

---

## 🏆 **RECOMMENDATION: Use AWS Amplify**

**Amplify is the easiest because:**
- No server management
- Automatic deployments from GitHub
- Built-in HTTPS
- Automatic scaling
- 5-minute setup

**Just connect your GitHub repo and you're done!**

---

## 📋 **Quick Start Checklist:**

- [ ] Choose deployment method (Amplify recommended)
- [ ] Connect GitHub repository
- [ ] Configure build settings
- [ ] Add custom domain
- [ ] Upload SSL certificates
- [ ] Deploy!

**Total time: 5-15 minutes depending on method chosen.**
