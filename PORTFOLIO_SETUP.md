# How to publish this portfolio copy

This copy is deliberately separate from the project that is deployed. Publishing it will not change the live Cloudflare Worker or Netlify site.

1. On GitHub, create a **public** repository named `rollos-city` or `rollo-city` and **leave README and .gitignore unchecked** (already included).
2. Download/unzip this portfolio ZIP and use its extracted folder, **not** the older deployed Cloudflare folder.
3. Optional: Edit `README.md` to add your real public Netlify demo URL and a brief honest summary of your role. Do not add any passwords, owner tokens or data exports.
4. To publish with GitHub Desktop: File > Add Local Repository > Choose this folder > Create a Repository if prompted > Publish repository, with **Keep this code private unchecked**.
5. Alternatively, use Terminal from inside this exact portfolio folder, after creating the empty remote repo:

   git init
   git add .
   git status
   git commit -m "Initial Rollo's City portfolio project"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/rollos-city.git
   git push -u origin main

GitHub authentication may require GitHub Desktop, GitHub CLI, a token, or SSH setup; a GitHub account password alone is not accepted for HTTPS Git pushes.

After publishing, link to https://github.com/YOUR-USERNAME/rollos-city in applications and, optionally, link to the separate live Netlify demo. Review all files before publication. GitHub is public and irreversible copies may be made of any committed information.
