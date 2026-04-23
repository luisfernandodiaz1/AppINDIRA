const fs = require('fs');

const datePrefix = "2023-01-15T00:00:00.000Z";

const driversList = [
  { c: "1098765432", n: "Carlos Mendoza" },
  { c: "1001001001", n: "Enrique Montero" },
  { c: "1001001002", n: "Alfredo Tatis" },
  { c: "1001001003", n: "Jose Gracia" },
  { c: "1001001004", n: "Jose Pajaro" },
  { c: "1001001005", n: "Nauro Perez" },
  { c: "1001001006", n: "Freddys Condes" },
  { c: "1001001007", n: "Joaquin Mendoza" },
  { c: "1001001008", n: "Ronald Padilla" },
  { c: "1001001009", n: "Jorge Arrieta" },
  { c: "1001001010", n: "Antonio Orozco" },
  { c: "1001001011", n: "Federico Ballestas" },
  { c: "1001001012", n: "Jaime Cerda" },
  { c: "1001001013", n: "Rafael Babilonia" },
  { c: "1001001014", n: "Jorgeluis Llerena" },
  { c: "1001001015", n: "Sandy Meza" },
  { c: "1001001016", n: "Victor Hernandez" },
  { c: "1001001017", n: "Juan Manjarres" },
  { c: "1001001018", n: "Hoiner Arroyo" },
  { c: "1001001019", n: "Luis Fuente" },
  { c: "1001001020", n: "Willian Lopez" },
  { c: "1001001021", n: "Victor Medrano" },
  { c: "1001001022", n: "Cristian Montero" },
  { c: "1001001023", n: "Dayder Pupo" },
  { c: "1001001024", n: "Luis Teheran" },
  { c: "1001001025", n: "Cristian Sepulveda" },
  { c: "1001001026", n: "Libardo Perez" },
  { c: "1001001027", n: "Fray Baltazar" },
  { c: "1001001028", n: "Jose Polo" },
  { c: "1001001029", n: "Fray Fonseca" },
  { c: "1001001030", n: "Luis Nuñez" }
];

const drivers = driversList.map((d, i) => ({
  id: `drv_17769068${i.toString().padStart(5, '0')}`,
  createdAt: datePrefix,
  name: d.n,
  cedula: d.c,
  status: "active",
  licenseCategory: "C2",
  phone: "",
  notes: ""
}));

const backupData = {
  version: 1,
  timestamp: new Date().toISOString(),
  config: {
    company: "Transportes CI",
    shiftDStart: "07:00",
    shiftDEnd: "17:00",
    shiftNStart: "19:00",
    shiftNEnd: "05:00",
    monthlyTarget: 184,
    weeklyTarget: 46,
    regulationYear: "2025"
  },
  drivers: drivers,
  schedule: {}
};

fs.writeFileSync('tci_export_trabajadores.json', JSON.stringify(backupData, null, 2));
console.log('JSON export successfully written.');
