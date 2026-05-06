/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            boxShadow: {
                glow: '0 0 0 1px rgba(56, 189, 248, 0.08), 0 20px 60px rgba(0, 0, 0, 0.35)',
            },
        },
    },
    plugins: [],
};