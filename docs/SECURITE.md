# 🔐 Sécurité — ce qui est protégé, et ce qui ne l'est pas (honnêtement)

Pas de promesses magiques ici. Voici la vérité simple.

## ✅ Ce qui est bien protégé

- **Le coffre `data/vault.enc`** est chiffré en **AES‑256‑GCM**. La clé vient de
  ton **mot de passe maître** via **scrypt** (lent exprès, pour gêner les
  devineurs de mot de passe).
- Si quelqu'un copie `data/vault.enc` **sans** ton mot de passe, il ne peut
  **rien** en faire.
- Le coffre vérifie aussi qu'il n'a **pas été modifié** (grâce au "tag" GCM) :
  un fichier trafiqué est refusé.

## ⚠️ Les limites honnêtes (à connaître)

1. **Pendant que le bot tourne**, la librairie `prismarine-auth` a besoin du jeton
   **écrit sur le disque** dans `data/token-cache/…` (en clair). C'est inévitable :
   c'est comme ça que la lib fonctionne.
   - Ce dossier est **ignoré par git** (jamais poussé sur GitHub).
   - Il est **effacé** quand tu quittes avec **Ctrl + C**.
2. **Le mot de passe maître n'est récupérable nulle part.** Si tu l'oublies, le
   coffre est perdu. (C'est le prix d'un vrai chiffrement.)
3. **Le dossier `samples/` et les fichiers `.zip`** contiennent des jetons en clair.
   Ils sont **ignorés par git**, mais sur ton disque ils sont lisibles. Importe-les
   dans le coffre puis **supprime-les** si tu veux être propre.
4. **Les refresh tokens "tournent".** Quand on en utilise un, Microsoft en donne un
   nouveau et **invalide l'ancien**. Le programme sauvegarde le nouveau dans le
   coffre. ⚠️ Conséquence : **n'importe pas deux fois le même vieux `.zip`** après
   un rafraîchissement — son refresh token est peut-être déjà mort. Importe plutôt
   `samples/import-me` (les jetons frais).

## 🧯 "needs login" (rouge dans le tableau) — ça veut dire quoi ?

Le compte ne peut **pas** se connecter tout seul, parce que :
- son jeton est périmé, **et**
- son refresh token est absent ou refusé par Microsoft (mort/révoqué).

➡️ Solution : **réexporte ce compte** (nouvel export avec un refresh token frais),
puis réimporte-le.

## 🛡️ Bonnes pratiques

- **Ne pousse JAMAIS** `data/`, `config/config.json`, `samples/` ou les `.zip`
  sur GitHub. Le fichier `.gitignore` est déjà réglé pour ça — ne l'enlève pas.
- Utilise un **mot de passe maître unique** (pas le même que partout ailleurs).
- Si tu partages ton code sur GitHub, vérifie **avant de pousser** :
  ```bash
  git status        # aucun fichier de data/ ou .zip ne doit apparaître
  ```
- Quitte proprement avec **Ctrl + C** pour effacer les jetons en clair.

## 🔁 Changer / renforcer la sécurité

- **Changer le mot de passe maître** : (fonctionnalité simple à ajouter) ou
  recrée un coffre — supprime `data/vault.enc`, relance, choisis un nouveau mot de
  passe, et réimporte tes comptes.
- **Paramètre scrypt** : déjà solide (`N = 32768`). Tu peux l'augmenter dans
  `src/vault/crypto.js` si tu veux (plus lent = plus dur à attaquer).
