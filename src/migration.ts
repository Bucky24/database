import { Model } from "./model";
import { FIELD_META, FIELD_TYPE } from "./types";

type Migration = {
    name: string,
    cb: () => Promise<void>,
};

type MigrationRow = {
    migration: string,
    createdAt: number,
};

export class MigrationHandler {
    private static migrations: Migration[] = [];

    public static registerMigration(name: string, cb: () => Promise<void>): void {
        MigrationHandler.migrations.push({
            name,
            cb,
        });
    }

    public static async runMigrations(): Promise<void> {
        const migrationTable = Model.create({
            table: '__migrations__',
            fields: {
                'migration': {
                    type: FIELD_TYPE.STRING,
                    meta: [FIELD_META.REQUIRED],
                },
                'createdAt': {
                    type: FIELD_TYPE.BIGINT,
                },
            },
        });

        await migrationTable.init();
        const names = (await migrationTable.search() as MigrationRow[]).map((row) => row.migration);

        for (const migration of MigrationHandler.migrations) {
            if (names.includes(migration.name)) {
                // it's already run
                continue;
            }

            console.log(`Running migration ${migration.name}`);

            await migration.cb();

            console.log(`Migration ${migration.name} complete`);

            await migrationTable.insert({
                migration: migration.name,
                createdAt: Math.floor(Date.now() / 1000),
            });
        }
    }

    public static resetMigrations() {
        this.migrations = [];
    }
}