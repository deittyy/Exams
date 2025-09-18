# Deployment Guide for C&S Unification ExamTest

This guide covers deploying your CBT platform to both Vercel and Render.

## ⚠️ CRITICAL: Required Package.json Updates

**YOU MUST ADD THESE SCRIPTS** to your `package.json` before deploying or the build will fail:

```json
{
  "scripts": {
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build",
    "build:server": "tsc --project tsconfig.server.json",
    "start": "NODE_ENV=production node dist/server/index.js",
    "vercel-build": "npm run build:client",
    "render-build": "npm run build && npm run db:push"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=8.0.0"
  }
}
```

## Deployment Options

### Option 1: Render (Recommended for Full-Stack)

**Render is best for this app because:**
- Supports full Express.js applications
- Built-in PostgreSQL database
- Easy environment variable management
- WebSocket support

**Steps:**
1. Push your code to GitHub
2. Connect your GitHub repo to Render
3. Create a new Web Service
4. Use these settings:
   - **Build Command**: `npm install && npm run build && npm run db:push`
   - **Start Command**: `npm start`
   - **Environment**: Node.js

**Environment Variables to Set in Render:**
```
NODE_ENV=production
DATABASE_URL=<auto-provided-by-render-postgres>
SESSION_SECRET=<generate-random-secret>
ALLOWED_ORIGINS=https://your-frontend-domain.com
```

### Option 2: Vercel + Render (Split Deployment)

**Use this if you want Vercel's global CDN for frontend:**
- Deploy backend to Render
- Deploy frontend to Vercel

**Steps:**

1. **Deploy Backend to Render:**
   - Follow Render steps above
   - Note the backend URL (e.g., `https://your-app.onrender.com`)

2. **Deploy Frontend to Vercel:**
   - Update `vercel.json` with your backend URL:
   ```json
   {
     "rewrites": [
       {
         "source": "/api/(.*)",
         "destination": "https://your-backend-url.onrender.com/api/$1"
       }
     ]
   }
   ```
   - Deploy to Vercel using: `vercel --prod`

## Database Setup

### For Render:
- Create a PostgreSQL database in Render
- The `DATABASE_URL` will be auto-provided
- Run `npm run db:push` to create tables

### For External Database (Neon/Supabase):
- Get your connection string
- Set `DATABASE_URL` in environment variables
- Ensure the database allows connections from your hosting platform

## Environment Variables

### Required Variables:
```bash
NODE_ENV=production
DATABASE_URL=postgresql://...
SESSION_SECRET=your-super-secret-key-min-32-chars
# PORT is automatically set by Render, do not configure manually
```

### Optional Variables:
```bash
ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com
```

## Pre-deployment Checklist

- [ ] Update CORS origins in `server/index.ts` with your production domains
- [ ] Set strong `SESSION_SECRET` (minimum 32 characters)
- [ ] Test database connection
- [ ] Verify all environment variables are set
- [ ] Test the build process locally: `npm run build`
- [ ] Ensure `package.json` has the required scripts

## Troubleshooting

### Common Issues:

1. **Build Fails:**
   - Check Node.js version (requires >=18)
   - Verify all dependencies are in `package.json`
   - Run `npm run build` locally first

2. **Database Connection Issues:**
   - Verify `DATABASE_URL` format
   - Check if database allows external connections
   - Ensure SSL is properly configured

3. **Session/Auth Issues:**
   - Set a strong `SESSION_SECRET`
   - Check CORS configuration
   - Verify cookie settings for production

4. **CORS Errors:**
   - Add your production domain to `allowedOrigins` array
   - Check protocol (http vs https)
   - Verify credentials are set to true

## Performance Optimization

- Enable gzip compression
- Set up database connection pooling
- Configure caching headers
- Monitor database query performance
- Set up health checks

## Security Considerations

- Use HTTPS in production
- Set secure session cookies
- Configure proper CORS origins
- Use environment variables for secrets
- Regular security updates

## Monitoring

Set up monitoring for:
- Application uptime
- Database performance
- Error tracking
- User session metrics