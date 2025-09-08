# Authentication & Permissions System

This document describes the authentication and permissions system implemented for the Football Tournaments application.

## Overview

The system implements role-based access control with two main user types:
- **Super Admin**: Full access to all organizers and tournaments
- **Organizer**: Access only to their own tournaments and data

## Security Features

### Password Security
- Passwords are hashed using PBKDF2 with SHA-512
- Each password has a unique salt (32 bytes)
- 100,000 iterations for key derivation
- No passwords are stored in plain text

### Session Management
- JWT-like session tokens (32 bytes)
- Sessions expire after 7 days
- Sessions are stored in DynamoDB
- Automatic cleanup of expired sessions

### Database Security
- Separate DynamoDB tables for authentication data
- Encrypted at rest (AWS DynamoDB encryption)
- No sensitive data in client-side storage

## User Accounts

### Super Admin Account
- **Username**: `Slazhen`
- **Password**: `qweRTY1`
- **Access**: Full system access
- **Auto-created**: Yes, on first application startup

### Organizer Accounts
- **Username**: Organization name
- **Password**: Set during organizer creation
- **Access**: Only their own data
- **Created by**: Super Admin

## Database Tables

### AUTH_USERS Table
Stores user account information:
```typescript
{
  id: string              // Unique user ID
  username: string        // Login username
  role: 'super_admin' | 'organizer'
  passwordHash: string    // PBKDF2 hash
  salt: string           // Unique salt
  organizerId?: string   // For organizer users
  createdAt: string      // ISO timestamp
  lastLogin?: string     // ISO timestamp
  isActive: boolean      // Account status
}
```

### AUTH_SESSIONS Table
Stores active user sessions:
```typescript
{
  id: string           // Unique session ID
  userId: string       // Reference to user
  token: string        // Session token
  expiresAt: string    // ISO timestamp
  createdAt: string    // ISO timestamp
  userAgent?: string   // Browser info
  ipAddress?: string   // Client IP
}
```

## Setup Instructions

### 1. Create Database Tables
```bash
npm run setup-auth
```

### 2. Environment Variables
Ensure these are set in your `.env` file:
```env
VITE_AWS_REGION=us-east-1
VITE_AWS_ACCESS_KEY_ID=your_access_key
VITE_AWS_SECRET_ACCESS_KEY=your_secret_key
```

### 3. Deploy Application
The super admin account will be automatically created on first startup.

## API Endpoints

### Authentication
- `POST /admin/login` - User login
- `POST /admin/logout` - User logout
- `GET /admin/verify` - Verify session

### User Management (Super Admin Only)
- `GET /admin/users` - List all users
- `POST /admin/users` - Create new user
- `PUT /admin/users/:id/password` - Reset password
- `DELETE /admin/users/:id` - Deactivate user

## Access Control

### Super Admin Permissions
- Access all organizers
- Access all tournaments
- Create/delete organizers
- Reset any user password
- Manage user accounts
- View system statistics

### Organizer Permissions
- Access only their own organizers
- Access only their own tournaments
- Create/edit their own tournaments
- Manage their own teams and players
- View their own statistics

## Security Best Practices

1. **Password Requirements**
   - Minimum 8 characters
   - Mix of letters, numbers, and symbols
   - No common passwords

2. **Session Security**
   - Tokens are random and unpredictable
   - Sessions expire automatically
   - Logout invalidates all sessions

3. **Access Control**
   - Role-based permissions
   - Resource-level access control
   - Automatic permission checks

4. **Audit Trail**
   - Login/logout tracking
   - Last login timestamps
   - Session creation tracking

## Troubleshooting

### Common Issues

1. **"Access Denied" Error**
   - Check user role and permissions
   - Verify session is valid
   - Ensure user account is active

2. **Login Failed**
   - Verify username and password
   - Check if account is active
   - Ensure database tables exist

3. **Session Expired**
   - Re-login required
   - Sessions expire after 7 days
   - Clear browser storage if needed

### Debug Mode
Enable debug logging by setting:
```env
VITE_DEBUG_AUTH=true
```

## Future Enhancements

- Multi-factor authentication (MFA)
- Password complexity requirements
- Account lockout after failed attempts
- Email verification for new accounts
- Password reset via email
- Audit logging for all actions
- API rate limiting
- IP-based access restrictions
