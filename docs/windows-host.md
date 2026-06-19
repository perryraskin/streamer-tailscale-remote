# Running RokuPi on a Windows laptop (no Pi)

You don't need a Raspberry Pi to use RokuPi for **remote control + the AI
agent**. Any always-on machine on the same LAN as the Roku works. This guide
covers using a spare Windows laptop as an interim host until you set up a Pi.

> The only thing a laptop can't do is **Part 2 (HDMI capture / live screen
> view)** — that wants dedicated hardware near the TV. Everything in Part 1
> works fine here.

The whole trick on a laptop is keeping it from sleeping and making the server
start on boot. Here's the full path.

## 1. Install prerequisites

In **PowerShell as Administrator**:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install tailscale.tailscale
```

Reopen PowerShell so `node`, `git`, and `tailscale` are on PATH.

## 2. Connect Tailscale

Launch Tailscale and sign in to **your** account so the laptop joins your
tailnet. Note its address — your phone and AI agent will use it:

```powershell
tailscale ip -4
```

## 3. Get the app

```powershell
git clone https://github.com/perryraskin/roku-tailscale-remote.git C:\rokupi
cd C:\rokupi
npm install
```

## 4. Test once

```powershell
node server.js
```

Click **Allow** on the Windows Firewall prompt (private networks). From your
phone on Tailscale, open `http://<laptop-tailscale-ip>:3000` and press Home.
`Ctrl+C` to stop once it works.

## 5. Stop it sleeping (critical)

A laptop suspends on idle or lid-close, which kills the server and Tailscale.
In **admin PowerShell**:

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
powercfg /change hibernate-timeout-ac 0
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setactive SCHEME_CURRENT
```

Keep it plugged in. The screen turning off is fine — only OS sleep matters.

## 6. Run as a Windows service

The systemd-unit equivalent for Windows. Using [NSSM](https://nssm.cc):

```powershell
winget install NSSM.NSSM
nssm install RokuPi "C:\Program Files\nodejs\node.exe" "C:\rokupi\server.js"
nssm set RokuPi AppDirectory C:\rokupi
nssm set RokuPi AppExit Default Restart
# Optional env: pin the Roku and/or write a log file
# nssm set RokuPi AppEnvironmentExtra ROKU_IP=192.168.1.50 LOG_FILE=C:\rokupi\rokupi.log
nssm start RokuPi
```

A service has no interactive session, so the firewall prompt from step 4 won't
appear — add the rule explicitly:

```powershell
netsh advfirewall firewall add rule name="RokuPi" dir=in action=allow protocol=TCP localport=3000
```

## 7. Verify

Reboot, **don't** log in, and hit `http://<laptop-tailscale-ip>:3000` from your
phone. If Home works, it's solid.

## Managing the service

```powershell
nssm restart RokuPi
nssm stop RokuPi
nssm status RokuPi
nssm remove RokuPi confirm   # uninstall when you move to a Pi
```

## Notes

- **Discovery:** SSDP auto-discovery works from the laptop just like on the Pi.
  Set `ROKU_IP` only if discovery is blocked or you want to pin it.
- **Logs:** with `LOG_FILE` set (see step 6) you get a flat JSON log at that
  path. Without it, NSSM can capture stdout — see `nssm set RokuPi AppStdout`.
- **Safety net:** if you can already remote into this laptop, you can always
  `nssm restart RokuPi` if anything goes sideways — no physical access needed.
- **Migrating to a Pi later:** same repo, same steps in Linux form (see the
  main README). Retire the service here with `nssm remove RokuPi confirm`.
