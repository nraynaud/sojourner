# Planetary Data System 
The file are available at [JPL](https://planetarydata.jpl.nasa.gov/img/data/mpf/) for the ground part, and at [New Mexico State University](https://atmos.nmsu.edu/PDS/data/mpam_0001/) for the atmosphere. 

```shell
wget --recursive -N --no-parent -nH --cut-dirs=3 -R 'index.html*' https://planetarydata.jpl.nasa.gov/img/data/mpf/
wget --recursive -N --no-parent -nH --cut-dirs=2 -R 'index.html*' https://atmos.nmsu.edu/PDS/data/mpam_0001/
```
