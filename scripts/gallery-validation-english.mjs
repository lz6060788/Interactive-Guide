export const GALLERY_VALIDATION_ENGLISH = {
  projectTitle: 'Semiconductor Equipment Industry Chain Gallery',
  stages: {
    upstream: 'Upstream',
    midstream: 'Midstream',
    downstream: 'Downstream',
  },
  categories: {
    核心零部件: 'Core Components',
    工艺材料: 'Process Materials',
    图形成形设备: 'Patterning Equipment',
    薄膜热处理设备: 'Thin-Film Deposition and Thermal Processing Equipment',
    湿法平坦设备: 'Wet Processing and Planarization Equipment',
    过程控制设备: 'Process Control Equipment',
    封装测试设备: 'Packaging and Testing Equipment',
    晶圆制造: 'Wafer Fabrication',
    先进封装: 'Advanced Packaging',
    终端需求: 'End-Market Demand',
  },
  items: {
    真空系统: {
      title: 'Vacuum Systems',
      description:
        'Foundational systems that maintain a clean, low-pressure environment inside process chambers. Pumping capacity, leak rate, and particle control determine stable equipment operation.',
    },
    射频电源: {
      title: 'RF Power Supplies',
      description:
        'Power modules that deliver high-frequency energy to plasma processes. Power stability affects the uniformity of etching and deposition.',
    },
    运动控制系统: {
      title: 'Motion Control Systems',
      description:
        'Control systems responsible for wafer handling, alignment, and stage positioning. Precision and reliability affect equipment throughput and yield.',
    },
    光学部件: {
      title: 'Optical Components',
      description:
        'Provide imaging and beam control for exposure, inspection, and metrology. Surface-form accuracy and coating quality determine pattern resolution.',
    },
    陶瓷部件: {
      title: 'Ceramic Components',
      description:
        'Support wafers or protect chambers in high-temperature, plasma, and corrosive-gas environments. They are critical to equipment life and particle control.',
    },
    阀门管路: {
      title: 'Valves and Piping',
      description:
        'Reliably deliver high-purity gases, chemicals, and vacuum flows within equipment. Cleanliness, sealing, and corrosion resistance affect process repeatability.',
    },
    掩模版: {
      title: 'Photomasks',
      description:
        'High-precision carriers of circuit patterns. Defect control and overlay accuracy affect lithography yield.',
    },
    抛光耗材: {
      title: 'CMP Consumables',
      description:
        'Slurries, pads, and cleaning materials used in CMP. They determine nanoscale planarization efficiency and surface defect levels.',
    },
    电子特气: {
      title: 'Electronic Specialty Gases',
      description:
        'High-purity gases used for etching, deposition, cleaning, and doping. Purity and supply continuity directly affect wafer contamination control.',
    },
    光刻设备: {
      title: 'Lithography Equipment',
      description:
        'Core equipment that transfers photomask patterns onto wafers through exposure. Resolution, overlay accuracy, and throughput define the limits of advanced process nodes.',
    },
    涂胶显影设备: {
      title: 'Photoresist Coating and Developing Equipment',
      description:
        'Supporting equipment for photoresist coating, baking, and development. Film-thickness uniformity and particle control affect the lithography process window.',
    },
    刻蚀设备: {
      title: 'Etching Equipment',
      description:
        'Vacuum equipment that precisely removes films or silicon along lithographic patterns. High-aspect-ratio etching capability is a key bottleneck for advanced logic and 3D memory.',
    },
    薄膜沉积设备: {
      title: 'Thin-Film Deposition Equipment',
      description:
        'Equipment that grows conductive, dielectric, or barrier layers on wafer surfaces. Film-thickness uniformity determines consistency across multilayer structures.',
    },
    热处理设备: {
      title: 'Thermal Processing Equipment',
      description:
        'Equipment that changes wafer material properties through oxidation, annealing, and diffusion. Temperature-field uniformity affects stable device electrical characteristics.',
    },
    离子注入设备: {
      title: 'Ion Implantation Equipment',
      description:
        'Equipment that implants dopant ions to specified depths in wafers. Dose, energy, and beam control determine device electrical parameters.',
    },
    清洗设备: {
      title: 'Wafer Cleaning Equipment',
      description:
        'Wet-process equipment that removes particles, metal ions, and residues. Cleaning performance is repeatedly amplified across many process steps.',
    },
    CMP设备: {
      title: 'CMP Equipment',
      description:
        'Equipment that planarizes wafer surfaces through chemical reaction and mechanical polishing. More complex multilayer interconnects in advanced nodes increase dependence on planarization.',
    },
    缺陷检测设备: {
      title: 'Defect Inspection Equipment',
      description:
        'Equipment that detects surface particles, scratches, and pattern anomalies on wafers. It is the front-end quality gateway for identifying yield problems early.',
    },
    量测设备: {
      title: 'Metrology Equipment',
      description:
        'Equipment that measures critical parameters such as linewidth, film thickness, overlay, and morphology, helping engineers determine whether a process has drifted outside its window.',
    },
    晶圆测试设备: {
      title: 'Wafer Test Equipment',
      description:
        'Uses probes to contact dies on a wafer and screen electrical performance before packaging. Removing bad dies early reduces downstream cost.',
    },
    分选设备: {
      title: 'Chip Sorting Equipment',
      description:
        'Classifies tested chips by performance grade, appearance, and electrical results, affecting automation efficiency in packaging and test lines.',
    },
    固晶设备: {
      title: 'Die Bonding Equipment',
      description:
        'Packaging equipment that precisely attaches bare dies to substrates or leadframes. Speed, accuracy, and stability affect packaging yield.',
    },
    键合设备: {
      title: 'Bonding Equipment',
      description:
        'Creates electrical connections through wire, bump, or wafer-level bonding. Advanced packaging demands higher precision and cleanliness.',
    },
    逻辑晶圆厂: {
      title: 'Logic Fabs',
      description:
        'Production lines for processors, communications, and mixed-signal chips. They are a major source of front-end equipment capital expenditure.',
    },
    存储晶圆厂: {
      title: 'Memory Fabs',
      description:
        'Production lines for DRAM, NAND, and high-bandwidth memory. Layer scaling and node migrations drive demand for etching, deposition, and metrology.',
    },
    特色工艺产线: {
      title: 'Specialty Process Lines',
      description:
        'Mature-node production lines for power, RF, analog, and sensor devices. Equipment demand emphasizes stability, cost, and local service.',
    },
    先进封装产线: {
      title: 'Advanced Packaging Lines',
      description:
        'Integrates multiple chips into systems through wafer-level packaging, flip-chip, bonding, and testing. AI chips are driving upgrades in back-end equipment.',
    },
    人工智能芯片: {
      title: 'AI Chips',
      description:
        'Training and inference chips drive demand for advanced logic, HBM, and advanced packaging, making them a major end-market catalyst for equipment cycles.',
    },
    汽车电子芯片: {
      title: 'Automotive Electronics Chips',
      description:
        'Automotive-grade power, sensing, control, and analog chips require reliable long-lifecycle supply, supporting demand for mature-node and specialty-process equipment.',
    },
  },
  hints: {
    atlas: 'Drag or zoom to explore the panorama',
    catalog: 'Click or scroll through the text to view details',
    gallery: 'Click or scroll through the text to switch node images',
  },
}

export function requireGalleryEnglish(collection, key, kind) {
  const value = collection[key]
  if (!value) throw new Error(`missing authored English ${kind} for "${key}"`)
  return value
}
