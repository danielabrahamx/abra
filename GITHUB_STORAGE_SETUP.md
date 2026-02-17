# GitHub Storage Setup

This app now uses **GitHub as a backend** instead of Netlify Blobs. Data is stored directly in your repository's `data/` folder.

## Setup Instructions

### 1. Create a GitHub Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → **Tokens (classic)**
2. Click "Generate new token (classic)"
3. Give it a descriptive name: `Netlify Abra App`
4. Set expiration (recommend: 90 days or No expiration)
5. Select scopes:
   - ✅ **repo** (Full control of private repositories)
6. Click "Generate token"
7. **Copy the token immediately** (you won't see it again!)

### 2. Add Token to Netlify Environment Variables

1. Go to your Netlify site dashboard: https://app.netlify.com
2. Navigate to: **Site settings** → **Environment variables**
3. Click **Add a variable**
4. Add the following:
   - **Key**: `GITHUB_TOKEN`
   - **Value**: (paste your GitHub token)
   - **Scopes**: All scopes (or just Production if you prefer)
5. Click **Save**

### 3. Optional: Configure Repository Details

If your GitHub username or repo name is different from the defaults, add these environment variables too:

- `GITHUB_OWNER` - Your GitHub username (default: `danielabrahamx`)
- `GITHUB_REPO` - Your repository name (default: `abra`)
- `GITHUB_BRANCH` - Your branch name (default: `main`)

### 4. Deploy

After adding the environment variables:

1. Trigger a new deploy in Netlify (or just push a commit)
2. The app will now read/write data to your GitHub repository
3. You can view all changes in your GitHub commit history!

## How It Works

- **Read operations**: Fetch JSON files from `data/schedule.json` and `data/clients.json` via GitHub API
- **Write operations**: Create commits to update these files
- **Commit messages**: Automatically generated (e.g., "Add client: Helen", "Update workers for Team_A on 17-02-2026")
- **Version control**: Every change is tracked in Git history

## Benefits

✅ No external database needed  
✅ Full version control and audit trail  
✅ Easy to backup (just clone the repo)  
✅ Works on Netlify's free tier  
✅ Can manually edit data files if needed  

## Troubleshooting

If you get errors about "GITHUB_TOKEN environment variable is required":
- Make sure you added the token to Netlify environment variables
- Redeploy the site after adding the variable
- Check the Netlify function logs for detailed error messages
