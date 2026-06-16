# 🍩 Setup — explained like you're 5

We're going to run a little robot that mines dirt by itself on DonutSMP. Follow the
steps. If you can click and type, you can do this. 💪

---

## 🧩 Step 0 — What you need

One tool: **Node.js** (the "engine" that runs the robot).

> 🔎 On this computer it's **already installed**. On another computer: go to
> **https://nodejs.org**, click the big **LTS** button, install (click "Next"
> everywhere). Done.

---

## ▶️ Step 1 — Start the robot

1. Open the **`donut smp miner`** folder.
2. **Double-click** **`start.bat`**.
3. A black window (the "console") opens.
   - The very first time, it installs small tools. Wait 1–2 minutes. ☕

---

## 🔐 Step 2 — Pick a password (the vault)

The console asks you to **create a master password**.

- It's the **key to your safe** that keeps your accounts protected.
- Type a password, press **Enter**, then type it again to confirm.

> ⚠️ **Very important:** write this password down. If you forget it, **nobody** can
> open the vault (that's on purpose, to protect you).

---

## 📥 Step 3 — Add your accounts

The console asks: *"Import accounts now?"* → answer **yes** (Enter).

Then it asks for a **path**. You have **2 choices**:

- ✅ **Easiest (recommended):** type the path to the ready-made folder:
  ```
  samples/import-me
  ```
  👉 It already contains your accounts with **fresh tokens**.

- Or the path to a `.zip` you have (e.g. `WEB-004200.zip`).

Press **Enter**. The console says how many accounts it added. 🎉

> 💡 **Why `samples/import-me`?** The old tokens in the `.zip` files were **expired**.
> We already refreshed them and put them in that folder. Import it and everything
> works right away.

---

## 🚀 Step 4 — Run the bots

In the menu, use the **arrow keys** to pick:

```
▶  Run the bots (live dashboard)
```

and press **Enter**.

You now see a **table** that updates by itself:

| # | Account | State | Dirt | HP | Position |
|---|---------|-------|------|----|----------|
| 1 | Over41 | ⛏ mining | 42 | 20 | 100 64 -3 |

What the robot does on its own:
- ⛏ mines dirt,
- 🪵 if it runs out of shovels, it chops wood and **crafts more shovels**,
- 🎒 keeps only the dirt and **drops the junk**,
- 🛡️ **defends itself** from monsters (and raises a shield if it has one),
- ✅ when its bag is full of dirt, it **logs out** and says **done**.

Go **back to the menu**: press **`q`**.
**Quit everything**: press **Ctrl + C**.

---

## 🛠️ The menu

| Choice | What it does |
|--------|--------------|
| ▶ Run the bots | Start everything + the dashboard |
| 📥 Import accounts | Add accounts (zip or folder) |
| 📋 List my accounts | Show status (token valid? refresh? proxy?) |
| 🔄 Test / refresh a token | Make a brand-new token for an account |
| 🚪 Quit | Close the program |

---

## ❓ Common problems

- **"Node.js is not installed"** → install it from https://nodejs.org (LTS button).
- **"Wrong password"** → that's the vault password, not your Minecraft one.
- **An account shows "needs login" (red)** → its token is dead AND its refresh token
  no longer works. Re-export that account. (See [`SECURITE.md`](SECURITE.md).)
- **Change the server, mining radius, combat, etc.** → open `config/config.json`
  with Notepad and change the numbers. Every option is shown in
  [`config.example.json`](../config/config.example.json).

---

## 🌐 Bonus — Proxies (optional)

1. Open `config/config.json` with Notepad.
2. Set `"enabled": true` in the `"proxy"` section.
3. Put your proxies in the list:
   ```json
   "proxy": {
     "enabled": true,
     "mode": "rotate",
     "list": ["socks5://user:pass@1.2.3.4:1080", "1.2.3.4:1081"]
   }
   ```
4. Restart. Each account takes a proxy from the list.

That's everything. Have fun! 🍩
