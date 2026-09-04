import numpy as np
from osgeo import gdal
import matplotlib.pyplot as plt
import matplotlib
import json
matplotlib.use('qt5agg')

def load_dem_to_heightmap(tiff_path, output_npy=None, output_png=None, normalize=True):
    """
    Load a DEM TIFF file and convert it to a heightmap array
    
    Args:
        tiff_path (str): Path to input TIFF DEM file
        output_npy (str): Optional path to save heightmap as .npy file
        output_png (str): Optional path to save visualization as PNG
        normalize (bool): Whether to normalize elevation values to 0-1 range
    
    Returns:
        numpy.ndarray: 2D array of elevation values
    """
    # Open the TIFF file
    dataset = gdal.Open(tiff_path)
    if dataset is None:
        raise ValueError("Could not open the TIFF file")

    # Get the elevation band (typically band 1 in DEMs)
    band = dataset.GetRasterBand(1)
    
    # Read the data into a numpy array
    heightmap = band.ReadAsArray()
    
    # Replace any NoData values with 0
    nodata = band.GetNoDataValue()
    if nodata is not None:
        heightmap[heightmap == nodata] = 0
    
    # Normalize if requested
    if normalize:
        min_val = np.min(heightmap)
        max_val = np.max(heightmap)
        if max_val != min_val:  # Avoid division by zero
            heightmap = (heightmap - min_val) / (max_val - min_val)
    
    # Save outputs if requested
    if output_npy:
        np.save(output_npy, heightmap)
    
    if output_png:
        plt.imshow(heightmap, cmap='terrain')
        plt.colorbar(label='Elevation')
        plt.savefig(output_png, dpi=300, bbox_inches='tight')
        plt.close()
    
    return heightmap

# Example usage
if __name__ == "__main__":
    # Replace with your TIFF file path
    dem_file = "./data/mde/tancitaro_mde.tif"
    
    # Process the DEM
    heightmap = load_dem_to_heightmap(
        dem_file,
        output_npy="volcano_heightmap.npy",
        output_png="volcano_heightmap.png", 
        # normalize=False
    )
    json.dump(heightmap.tolist(), open("./data/heightmap.json", "w"))
    
    print(f"Heightmap shape: {heightmap.shape}")
    print(f"Min elevation: {np.min(heightmap):.2f}")
    print(f"Max elevation: {np.max(heightmap):.2f}")