module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: [
        '**/test.ts',
        '**/test_data.ts'
    ],
    setupFiles: ['<rootDir>/src/test_setup.ts']
};
