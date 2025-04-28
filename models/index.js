const db = require('../database');

class Users {
    static async findOne({ where }) {
        return new Promise((resolve, reject) => {
            const conditions = Object.entries(where)
                .map(([key, value]) => `${key} = ?`)
                .join(' AND ');
            
            const values = Object.values(where);
            
            db.get(`SELECT * FROM Users WHERE ${conditions}`, values, (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    }

    static async create(userData) {
        return new Promise((resolve, reject) => {
            const { name, login, password: password_hash, role } = userData;
            db.run(
                'INSERT INTO Users (name, login, password_hash, role) VALUES (?, ?, ?, ?)',
                [name, login, password_hash, role],
                function(err) {
                    if (err) reject(err);
                    resolve({ id: this.lastID, ...userData });
                }
            );
        });
    }
}

module.exports = {
    Users
}; 