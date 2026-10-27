# GitHub publish instructions

The linked GitHub account is `bjw05099-design`. Its accessible repositories at implementation time did not include a VEILPOINT project. **No unrelated repository was modified.**

Create a new private repo named `veilpoint-battle-royale` in your GitHub account and allow the ChatGPT GitHub connector to access it. Repository creation and connector permissions require the account owner's explicit action. Then upload this project to that repository.

Alternatively, from a computer with git and GitHub authentication:

```bash
cd veilpoint
git init
git add .
git commit -m "feat: VEILPOINT 1.0 offline prototype and UE5.8 scaffold"
git branch -M main
git remote add origin https://github.com/bjw05099-design/veilpoint-battle-royale.git
git push -u origin main
```

Do not upload credentials or tokens. `Unreal/Binaries`, `Intermediate` and generated files are ignored. Publish the complete project, not just the compiled preview.
