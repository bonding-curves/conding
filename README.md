# Conding

## Installation

### Installing as a Package

You can install Conding via pip:

```bash
pip install conding
```

Don't forget to set up your Dune API Key as an environment variable:

```bash
export DUNE_API_KEY='<Your Key>'
```

### Local Development

To work on Conding locally, follow these steps:

1. Clone the repository:

```bash
git clone git@github.com:bonding-curves/conding.git
cd conding
```

2. Add your Dune API Key to the .env file:

```bash
mv .env.template .env
vi .env
```

3. Install the requirements using Poetry. If you haven't installed Poetry yet, refer to the [Poetry documentation](https://python-poetry.org/docs/) for instructions:

```bash
poetry install --with dev
poetry shell
```

### Using Nbdev

To utilize Nbdev for development tasks, follow these commands:

1. Install git hooks and Quarto when running the package for the first time:

```bash
nbdev_install_hooks
nbdev_install_quarto
```

2. Run tests with Nbdev:

```bash
nbdev_test
```

3. Preview documentation locally:

```bash
nbdev_preview
```

4. Export changes made to notebooks:

```bash
nbdev_export
```

5. Build documentation:

```bash
nbdev_docs
```

For more options and detailed information on Nbdev, visit the [Nbdev documentation](https://nbdev.fast.ai/).

---

This guide helps you set up Conding for both package installation and local development. Make sure to follow the instructions carefully to ensure smooth operation. If you encounter any issues or have questions, refer to the provided resources or reach out to the Bonding Curve Research group for assistance.

---

## About Bonding Curve Research Group (BCRG)

Bonding Curve Research Group (BCRG) is an independent, decentralized collective of scholars, engineers, and researchers dedicated to the comprehensive study, development, and practical implementation of Bonding Curves. Our team brings together a diverse mix of expertise spanning systems engineering, mathematical modeling, economics, data & computer science, design, community building, and other related disciplines.

We are committed to driving innovation that broadens the potential applications of programmable financial primitives. At the core of our efforts is the pursuit of solutions to mitigate volatility and simplify the implementation of Bonding Curves, thereby democratizing these complex mathematical concepts and empowering developers and researchers.

## Links

- [Our Research](https://mirror.xyz/0x8fF6Fe58b468B1F18d2C54e2B0870b4e847C730d)
- [Notion](https://auspicious-cap-b5c.notion.site/Bonding-Curve-Research-Group-a0fe00e81d84435a8fddd547a7888063)
- [GitHub](https://github.com/bonding-curves)
- [Twitter](https://twitter.com/Bonding_Curves)
- [YouTube](https://www.youtube.com/@CondingBurves)
