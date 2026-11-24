// Default client-facing descriptions for the "What's included" page, matched by service title.
// A service's own description (Services & Tiers) always wins; services with neither are left off that page.
const DEFAULTS = [
  // General Requirements items (matched by pay item name)
  [/floor\s*plan/i, "A custom, 3D-rendered interactive model of your home's floor plan, built from your house plans. It powers the control panel, so every light, aircon and device appears where it is in your home and can be seen and controlled at a glance."],
  [/mobili[sz]ation/i, "Transport of our team, tools and equipment to and from your site for the duration of the installation, including the delivery of all smart home devices."],
  [/project management/i, "A dedicated project supervisor manages the installation from start to finish: scheduling, coordination with your contractor and other trades, quality checks, and the final testing and turnover of the system."],
  [/presence/i, "Advanced sensors will be installed in key rooms and bathrooms. These sensors detect your presence, automatically turning on the lights when you enter a room and turning them off after you leave, offering hands-free convenience and ensuring energy is never wasted."],
  [/light/i, "Provides complete control over your home's lighting from anywhere via a smartphone or the control panel. This system enhances convenience and improves energy efficiency by allowing you to ensure lights are never left on unnecessarily."],
  [/climate|aircon|hvac/i, "Allows you to manage your home's temperature remotely, ensuring you always come home to a comfortable environment. You can set intelligent schedules that align with your lifestyle, maximizing comfort while optimizing energy consumption."],
  [/cover|curtain|blind/i, "Gain effortless control over your home's natural light and privacy. Automate your curtains and blinds to open and close at set times, or manage them instantly with your phone, voice, or the central control panel."],
  [/lock/i, "Replaces your traditional key with secure, keyless entry. You can lock and unlock your doors remotely from your smartphone, grant temporary digital codes to guests, and receive notifications, providing both enhanced security and convenience."],
  [/gate/i, "This system provides a new level of convenience and security. Using advanced License Plate Recognition (LPR), the gate will automatically detect an authorized vehicle and open the garage gate seamlessly, without you needing to press a button or use a remote."],
  [/voice/i, "Strategically place Alexa Echo devices throughout the home, creating a hands-free environment. You will be able to use simple voice commands to control all integrated smart devices—including lights, climate, and blinds—as well as play music or get information."],
  [/alarm|entry/i, "This comprehensive system secures your home's perimeter. Sensors placed on vulnerable doors and windows will trigger a high-decibel alarm to deter intruders. It includes an \"Arm Away\" setting for when you are out, which will send an instant notification to your phone if a break-in is detected, and an \"Arm Night\" setting to secure the home while you are sleeping."],
  [/control panel|interactive/i, "A dedicated tablet will serve as the central command center for your home. This panel displays a custom, 3D-rendered floorplan of your residence that is fully interactive. When a light is turned on, its location will illuminate on the 3D plan in real-time. From this single screen, you can see the status of and control all your smart devices, including lights, climate, and blinds."],
  [/wi-?fi/i, "A professionally designed, whole-home WiFi system ensures seamless coverage across all areas, indoors and outdoors. This high-performance network supports all smart devices, ensuring reliable connectivity, fast speeds, and minimal dead zones."],
  [/cctv|surveillance|camera/i, "A comprehensive CCTV system provides 24/7 monitoring of your property. High-definition cameras with remote viewing, motion detection, recording capabilities, and mobile alerts ensure enhanced security and peace of mind."],
];

export const aboutFor = title => DEFAULTS.find(([re]) => re.test(title || ''))?.[1] ?? '';

// "SMART DOOR LOCK" -> "Smart Door Lock"; keeps known brand casing.
export const aboutTitle = title => String(title || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  .replace(/(?!^)\b(And|Or|Of|The|For|In)\b/g, w => w.toLowerCase()).replace(/\bWifi\b/g, 'WiFi').replace(/\bCctv\b/g, 'CCTV').replace(/\bLpr\b/g, 'LPR').replace(/\bAc\b/g, 'AC');
