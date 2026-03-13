// create_admins.js
const bcrypt = require('bcrypt');
const saltRounds = 10; // Standard security level

// --- Define your 5 admin users here ---
const adminsToCreate = [
    { username: 'admin1', plainPassword: 'Aarav' },
    { username: 'admin2', plainPassword: 'Vedant' },
    { username: 'admin3', plainPassword: 'Heta' },
    { username: 'admin4', plainPassword: 'Dwip' },
    { username: 'admin5', plainPassword: 'Bhavarth' }
];
// ------------------------------------

console.log("--- Generating Hashes ---");
console.log("Run the following SQL commands in your database tool (like phpMyAdmin):\n");
console.log("USE event_manager;");

let sqlCommands = [];
let promises = [];

adminsToCreate.forEach(admin => {
    promises.push(
        bcrypt.hash(admin.plainPassword, saltRounds).then(hash => {
            // Generate the SQL INSERT command
            // Escape single quotes in username/hash if necessary, though unlikely here
            const sql = `INSERT INTO admins (username, password) VALUES ('${admin.username.replace(/'/g, "''")}', '${hash.replace(/'/g, "''")}');`;
            sqlCommands.push(sql);
        }).catch(err => {
             console.error(`Error hashing password for ${admin.username}:`, err);
        })
    );
});

// Wait for all hashing operations to complete
Promise.all(promises).then(() => {
    console.log(sqlCommands.join('\n'));
    console.log("\n--- Hash generation complete ---");
    console.log("Copy the SQL commands above and run them in your database.");
});