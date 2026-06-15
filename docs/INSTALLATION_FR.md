# 🍩 Comment installer le robot — expliqué comme à un enfant de 5 ans

Salut ! On va lancer un petit robot qui mine de la terre tout seul sur DonutSMP.
Suis les images dans ta tête, étape par étape. Si tu sais cliquer et taper, tu sais le faire. 💪

---

## 🧩 Étape 0 — De quoi on a besoin

Un seul outil : **Node.js**. C'est le "moteur" qui fait tourner le robot.

> 🔎 Sur cet ordinateur, Node.js est **déjà installé**. Si tu fais ça sur un
> autre ordi : va sur **https://nodejs.org**, clique sur le gros bouton **LTS**,
> installe (clique "Suivant" partout), et voilà.

---

## ▶️ Étape 1 — Lancer le robot

1. Ouvre le dossier **`donut smp miner`**.
2. **Double-clique** sur le fichier **`start.bat`**.
3. Une fenêtre noire (la "console") s'ouvre.
   - La toute première fois, elle installe des petits outils. Attends 1–2 minutes. ☕

C'est tout pour démarrer !

---

## 🔐 Étape 2 — Choisir un mot de passe (le coffre-fort)

La console te demande de **créer un mot de passe maître**.

- C'est la **clé de ton coffre-fort** qui garde tes comptes en sécurité.
- Tape un mot de passe, appuie sur **Entrée**, puis retape-le pour confirmer.

> ⚠️ **Très important :** note ce mot de passe quelque part. Si tu l'oublies,
> PERSONNE ne peut ouvrir le coffre (c'est fait exprès pour te protéger).

---

## 📥 Étape 3 — Ajouter tes comptes

La console te demande : *"Importer des comptes maintenant ?"* → réponds **oui** (Entrée).

Ensuite elle demande un **chemin**. Tu as **2 choix** :

- ✅ **Le plus simple (recommandé) :** tape le chemin du dossier déjà préparé :
  ```
  samples/import-me
  ```
  👉 Ce dossier contient déjà tes comptes avec des **jetons tout neufs** (frais).

- Ou bien le chemin d'un fichier `.zip` que tu as (par ex. `WEB-004200.zip`).

Appuie sur **Entrée**. La console dit combien de comptes elle a ajoutés. 🎉

> 💡 **Pourquoi `samples/import-me` ?** Les vieux jetons des `.zip` étaient
> **périmés**. On les a déjà rafraîchis pour toi et rangés dans ce dossier.
> Importe celui-là pour que tout marche tout de suite.

---

## 🚀 Étape 4 — Lancer les robots

Dans le menu, choisis avec les **flèches du clavier** :

```
▶  Lancer les bots (tableau de bord en direct)
```

et appuie sur **Entrée**.

Tu vois maintenant un **tableau** qui se met à jour tout seul :

| # | Compte | État | Minés | Vie | Position |
|---|--------|------|-------|-----|----------|
| 1 | Over41 | ⛏ mining | 42 | 20 | 100 64 -3 |

- **⛏ mining** = il mine ! 🥳
- **Minés** = le nombre de blocs de terre cassés.

Pour **revenir au menu** : appuie sur la touche **`q`**.
Pour **tout fermer** : appuie sur **Ctrl + C**.

---

## 🛠️ Le menu, en résumé

| Choix | Ce que ça fait |
|-------|----------------|
| ▶ Lancer les bots | Démarre tout + le tableau de bord |
| 📥 Importer des comptes | Ajoute des comptes (zip ou dossier) |
| 📋 Voir mes comptes | Montre l'état (jeton valide ? refresh ? proxy ?) |
| 🔄 Tester / rafraîchir un jeton | Refait un jeton tout neuf pour un compte |
| 🚪 Quitter | Ferme le programme |

---

## ❓ Petits soucis fréquents

- **"Node.js n'est pas installé"** → installe-le depuis https://nodejs.org (bouton LTS).
- **"Mot de passe incorrect"** → c'est le mot de passe du coffre, pas celui de Minecraft.
- **Un compte dit "needs login" (rouge)** → son jeton est mort ET son refresh token
  ne marche plus. Il faut réexporter ce compte. (Voir [`SECURITE.md`](SECURITE.md).)
- **Je veux changer le serveur, le rayon de minage, etc.** → ouvre `config/config.json`
  avec le Bloc-notes et change les chiffres. (Tout est expliqué dans
  [`config.example.json`](../config/config.example.json).)

---

## 🌐 Bonus — Utiliser des proxys (facultatif)

1. Ouvre `config/config.json` avec le Bloc-notes.
2. Mets `"enabled": true` dans la partie `"proxy"`.
3. Mets tes proxys dans la liste, par exemple :
   ```json
   "proxy": {
     "enabled": true,
     "mode": "rotate",
     "list": ["socks5://user:pass@1.2.3.4:1080", "1.2.3.4:1081"]
   }
   ```
4. Relance le robot. Chaque compte prendra un proxy de la liste.

Voilà, tu sais tout ! Amuse-toi bien. 🍩
