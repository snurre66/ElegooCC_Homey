---
trigger: always_on
---

# Antigravity Rules: Elegoo Centauri Carbon Homey App

## Environment & Context

- **Hardware**: Homey Pro Early 2019 (SDK v3 compatibility).
- **Target Device**: Elegoo Centauri Carbon 3D Printer.
- **Workflow**: Git-based version control with HomeyCompose.

## Development Rules

1. **Capability Standards**: Use standard Homey capabilities where possible (e.g., `measure_temperature`, `onoff`) to ensure consistency with the Homey UI.
2. **Git Etiquette**: Always create a descriptive Git tag when preparing for a release. The Homey CLI does this automatically during `homey app publish`.

## Elegoo Centauri Carbon Specifics

- **Capabilities**: Implement sensors for nozzle temperature, bed temperature, print progress (%), and chamber temperature, and as many of the possibilities in the api.
- **Safety Features**: Include "Emergency Stop" as a button capability and flow cards for "Print Finished" or "Filament Runout".

## User Experience

- **Flow Cards**: Provide triggers for "Status Changed," "Temperature Reached," and "Progress is X%" in addition to flow cards to utilize all functions availeable from the api and homey
- **Insights**: use insights so that i can log every aspect of my printer.
- **App Assets**: Optimized to 500x350 and 250x175 landscape.
- **Driver Assets**: Precisely resized to 500x500 and 75x75 square.
- **Visual Quality**: All images maintain a premium, high-fidelity look on a solid white background.
- **Short README**: Keep the `README.md` concise and avoid Markdown formatting or URLs, as per Homey App Store guidelines.
