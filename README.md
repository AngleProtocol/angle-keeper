# <img src="logo.svg" alt="Angle Keeper" height="40px"> Angle Keeper

**Run a simple Keeper bot for Angle Protocol vaults**

## Run

### Install packages

You can install all dependencies by running

```bash
yarn
```

### Create `.env` file

Copy `.env.template` to `.env` and fill in your secrets.
This repo is based on an Alchemy provider. But you can easily adapt it with any RPC provider. Just make some changes in `src/provider.ts`

Remember: never write your secrets in plain text in your code.

### Run

Once you're ready, just type

```bash
yarn start
```

Or `yarn watch` if you have nodemon installed

## Media

Don't hesitate to reach out on [Twitter](https://twitter.com/AngleProtocol) 🐦
