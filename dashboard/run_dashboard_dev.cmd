@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d C:\Users\venky\Desktop\ufs\New folder\ufs-newsletter\dashboard
node_modules\.bin\dotenv.cmd -e ../.env -- node_modules\.bin\next.cmd dev
