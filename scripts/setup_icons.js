const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, 'assets', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 7 SVGs mapping perfectly to custom capabilities
// Updated for consistency: All progress icons use a 2px stroke, identical circular base, and centered content.
const svgs = {
  // 1. Clock/Timer (Time Left)
  'time_left.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
  
  // 2. Document/File (Filename)
  'filename.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
  
  // 3. Fan (Part Fan Speed)
  'part_fan_speed.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412Z"></path><circle cx="12" cy="12" r="2"></circle></svg>`,
  
  // 4. Progress Circle (Print Progress - Consistent Ring Style)
  'print_progress.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a10 10 0 1 0 10 10" opacity="0.4"></path><path d="M12 2a10 10 0 0 1 10 10"></path></svg>`,
  
  // 5. Stacked Layers (Layer Progress - Consistent Ring Style with Internal Stack)
  'layer_progress.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a10 10 0 1 0 10 10" opacity="0.4"></path><path d="M12 2a10 10 0 0 1 10 10"></path><path d="M8 9h8M8 12h8M8 15h8"></path></svg>`,
  
  // 6. Extrusion Factor (Drop/Settings)
  'extrusion_factor.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path></svg>`,
  
  // 7. Speedometer (Speed Factor)
  'speed_factor.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path><circle cx="12" cy="12" r="2"></circle><line x1="12" y1="12" x2="16" y2="8"></line></svg>`,

  // 8. Printer (Printer Status)
  'printer_status.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>`,

  // 9. Filament Spool (Filament Alarm)
  'filament_alarm.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="3"></circle><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"></path></svg>`,

  // 10. Z-Position (Height)
  'z_position.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M7 13l5 5 5-5M7 6l5 5 5-5"></path></svg>`,

  // 11. Info Circle (FW/Model/IP)
  'info.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,

  // 12. Pause (Pause Program)
  'button.pause.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,

  // 13. Play (Resume Program)
  'button.resume.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,

  // 14. Stop/Square (Cancel Program)
  'button.stop.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="16"></rect></svg>`,

  // 15. Home (Home Axes)
  'button.home.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,

  // 16. X-Position (Horizontal)
  'x_position.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M18 12H6M18 12l-4-4M18 12l-4 4"></path></svg>`,

  // 17. Y-Position (Vertical/Depth)
  'y_position.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 6v12M12 6l-4 4M12 6l4 4"></path></svg>`,

  // 18. Z-Offset (Precision Calibration)
  'z_offset.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="m8 18 4 4 4-4M12 2v20M12 2l-4 4m4-4 4 4"></path></svg>`,

  // 19. USB Disk (Storage)
  'usb_alarm.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M10 7v5M14 7v5M8 5h8v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V5Z"></path><path d="M11 17v4M13 17v4"></path></svg>`,

  // 20. Memory/Chip (System RAM)
  'memory.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><path d="M9 2v2M15 2v2M9 20v2M15 20v2M20 9h2M20 15h2M2 9h2M2 15h2"></path></svg>`,

  // 21. MAC Address (Network ID)
  'mac_address.svg': `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect x="16" y="16" width="6" height="6" rx="1"></rect><rect x="2" y="16" width="6" height="6" rx="1"></rect><rect x="9" y="2" width="6" height="6" rx="1"></rect><path d="M5 16v-3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M12 11V8"></path></svg>`
};

for (const [name, content] of Object.entries(svgs)) {
  fs.writeFileSync(path.join(iconsDir, name), content);
  console.log('Created ' + name);
}
console.log('All SVGs generated successfully!');
