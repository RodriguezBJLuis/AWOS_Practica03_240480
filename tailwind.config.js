module.exports = {
  content: [
    "./views/**/*.ejs",
    "./public/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        "google-blue": "#4285F4",
        "leaflet-green": "#199900"
      }
    }
  },
  plugins: [require("@tailwindcss/forms")]
};
