# 🕒 Real-Time Digital Clock  

A fully responsive **real-time digital clock** built using **HTML, CSS, and JavaScript**, powered by a lightweight **Node.js + Express** backend for accurate timezone synchronization.  
This project displays live time for multiple countries, automatically adjusts themes (day/night/sunrise/sunset), and features a realistic **tick-tock sound** option.

---

## 🚀 Features  

- 🌍 **Dynamic Timezones:** Fetches real-time data for any country using a custom API  
- 🎵 **Tick-Tock Sound:** Optional ticking sound synchronized with each second  
- ⚙️ **Interactive Settings Panel:** Toggle seconds display, enable/disable sound, and change clock format  
- 📱 **Responsive Design:** Works smoothly across all screen sizes  

---

## 🧠 Tech Stack  

**Frontend:**  
- HTML5  
- CSS3  
- Vanilla JavaScript  

**Backend:**  
- Node.js  
- Express.js  

**API:**  
- Custom built `/api/time/:timezone` endpoint  
- Optional integration with [TimeZoneDB](https://timezonedb.com/api)  

---

## 🛠️ Setup Instructions  

1. **Clone this repository**
   ```bash
   git clone https://github.com/your-username/realtime-digital-clock.git
   cd realtime-digital-clock
