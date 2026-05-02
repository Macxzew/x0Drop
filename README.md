# <h1 align="center">x0Drop <img src="assets/app-icon.png" width="20px"></h1>

> 📤 x0Drop is a desktop client for `x0.at`, built with Electron, React, and Vite, focused on fast uploads, local history, and a cleaner desktop workflow.

<center><img alt="x0Drop" src="assets/desktop.png"/></center>

---

## ✨ Features

- Drag & drop file staging  
- Native file picker support  
- Upload history stored locally per machine  
- Automatic link copy after upload  
- Link opening and history removal actions  
- File size preview in upload modal and history  
- Duplicate file detection using SHA-256 hash  
- Upload availability indicator (`Available`, `Offline`, `Blocked`, `Unreachable`)  
- Estimated retention countdown based on x0.at retention rules  
- Upload status toasts and animated modal transitions  

---

## 🔐 Notes

- Files are uploaded to `https://x0.at/`  
- Upload history is stored locally on the device  
- Duplicate detection is based on a locally stored SHA-256 file hash  
- Browser fallback mode is available during development, but the intended experience is the Electron app  

---

## 📦 Upload Behavior

- Drag files to stage them before sending  
- File size is shown before upload  
- Uploaded links are copied automatically  
- Duplicate files already present in history are skipped  
- Local history keeps upload date, file size, retention estimate, and remote URL  

---

## 🌐 Availability States

- `Available`: upload route looks reachable  
- `Offline`: no network connection detected  
- `Blocked`: remote service appears rate-limited or access-restricted  
- `Unreachable`: remote service or proxy could not be reached  

---

## 🚀 Usage

To use this project, follow the steps below in your preferred terminal.

### 1️⃣ Installing Dependencies

Before anything else, install the necessary dependencies:

```shell
npm install
```

Note: This step is required before building or running the application.

### 2️⃣ Run in Development

You can start the application in development mode with:

```shell
npm run dev
```

### 3️⃣ Build Desktop Output

To build the application locally:

```shell
npm run build
```

### 4️⃣ Platform Packages

#### 🔹 Windows

Build the Windows package with:

```shell
npm run build-win
```

#### 🔹 macOS

Build the macOS package with:

```shell
npm run build-mac
```

#### 🔹 Linux

Build the Linux package with:

```shell
npm run build-lin
```

---

## 👤 Author

Give a ⭐️ if this project helped you!

---

## 📝 License

Copyright © 2026 [Macxzew](https://github.com/Macxzew).<br />
This project is licensed under the MIT License.
