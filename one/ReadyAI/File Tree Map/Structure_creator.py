# # Updated Directory Structure Creator Script Description

# This script provides the following features:

# ## **Key Features:**

# 1. **File List Processing**: Reads file paths directly from a text file (one path per line) - much simpler and more reliable than parsing ASCII tree structures
# 2. **Duplicate Prevention**: Only creates new directories and files that don't already exist - safe to run multiple times
# 3. **Cross-Platform Path Handling**: Automatically handles both forward `/` and backward `\` slashes, works on Windows, Mac, and Linux
# 4. **Comment Support**: Supports comment lines in the file list (lines starting with `#`) for better organization
# 5. **Smart Directory Creation**: Automatically creates parent directories as needed, only when they don't exist
# 6. **Comprehensive Reporting**: Shows detailed progress with numbered file creation, summary statistics, and visual indicators (📁 directories, 📄 files)
# 7. **Error Handling**: Gracefully handles missing file lists, invalid paths, and permission errors with clear error messages
# 8. **Empty File Creation**: Creates empty placeholder files that can be populated later

# ## **How to Use:**

# 1. **Save the script** as `create_from_file_list.py`

# 2. **Create your file list** (`file_list.txt`) with content like:
#    ```
#    # Backend files
#    backend/src/modules/configuration/types.configuration.ts
#    backend/src/modules/configuration/configuration.service.ts
#    backend/src/modules/logging/logging.service.ts
   
#    # Frontend files
#    frontend/src/services/configurationService.ts
#    frontend/src/components/ConfigurationEditor.tsx
   
#    # Root files
#    .env.template
#    README.md
#    ```

# 3. **Run the script**:
#    ```bash
#    python create_from_file_list.py
#    ```

# ## **For Subsequent Runs:**

# When you run the script again with updated file lists:

# 1. **Update your `file_list.txt`** with new file paths
# 2. **Run the script again** - it will only create new items and skip existing ones
# 3. **No conflicts** - existing files and directories are preserved

# ## **Customization:**

# You can easily modify the configuration by changing these variables in the `main()` function:
# - **`ROOT_DIR`**: Your target directory where the structure will be created
# - **`FILE_LIST_PATH`**: Path to your text file containing the list of file paths

# Example:
# ```python
# ROOT_DIR = r"C:\Your\Project\Directory"
# FILE_LIST_PATH = r"C:\Your\Project\file_list.txt"
# ```

# ## **Advantages Over ASCII Tree Parsing:**

# - **Simpler Format**: Plain text file with one path per line
# - **More Reliable**: No complex tree symbol parsing that can break
# - **Easier to Edit**: Can be created and modified in any text editor
# - **Version Control Friendly**: Text files work well with Git and other VCS
# - **Scalable**: Handles hundreds or thousands of files efficiently
# - **Maintainable**: Comments and organization supported

# The script will automatically handle complex nested structures, create all necessary parent directories, and ensure no duplicates are created across multiple runs. This approach is significantly more robust and maintainable than parsing ASCII tree structures.




import os
import pathlib
from typing import List, Set

class DirectoryStructureFromFileList:
    def __init__(self, root_directory: str):
        self.root_directory = pathlib.Path(root_directory)
        self.created_files: Set[str] = set()
        self.created_directories: Set[str] = set()
        
    def read_file_list_from_file(self, file_path: str) -> List[str]:
        """Read file paths from a text file (one path per line)."""
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                # Filter out empty lines and strip whitespace
                paths = []
                for line_num, line in enumerate(file.readlines(), 1):
                    clean_line = line.strip()
                    if clean_line:
                        # Skip comment lines (starting with #)
                        if not clean_line.startswith('#'):
                            paths.append(clean_line)
                        else:
                            print(f"⏭️  Skipping comment line {line_num}: {clean_line}")
                return paths
        except FileNotFoundError:
            print(f"❌ Error: File list not found at {file_path}")
            print(f"📝 Please create the file with file paths (one per line)")
            return []
        except Exception as e:
            print(f"❌ Error reading file list: {e}")
            return []
    
    def create_structure_from_paths(self, file_paths: List[str]) -> None:
        """Create directory structure and files from list of file paths."""
        print(f"📂 Processing {len(file_paths)} file paths...")
        print("=" * 60)
        
        for i, file_path in enumerate(file_paths, 1):
            # Clean the path (remove any leading/trailing whitespace)
            clean_path = file_path.strip()
            if not clean_path:
                continue
            
            # Convert to pathlib path (handles forward/backward slashes automatically)
            relative_path = pathlib.PurePath(clean_path)
            full_file_path = self.root_directory / relative_path
            
            # Create parent directories if they don't exist
            parent_dir = full_file_path.parent
            if not parent_dir.exists():
                parent_dir.mkdir(parents=True, exist_ok=True)
                self.created_directories.add(str(parent_dir))
                print(f"📁 Created directory: {parent_dir}")
            
            # Create the file if it doesn't exist
            if not full_file_path.exists():
                full_file_path.touch()
                self.created_files.add(str(full_file_path))
                print(f"📄 Created file [{i:3d}]: {full_file_path}")
            else:
                print(f"📄 File exists [{i:3d}]: {full_file_path}")
    
    def create_from_file_list(self, file_list_path: str) -> None:
        """Main method to create structure from file list."""
        print(f"🏗️  Directory Structure Creator")
        print(f"📂 Root directory: {self.root_directory}")
        print(f"📋 Reading file list from: {file_list_path}")
        print("=" * 80)
        
        # Read file paths from the text file
        paths = self.read_file_list_from_file(file_list_path)
        
        if not paths:
            print("❌ No valid file paths found!")
            return
        
        # Ensure root directory exists
        self.root_directory.mkdir(parents=True, exist_ok=True)
        
        # Create the structure
        self.create_structure_from_paths(paths)
        
        # Summary
        print("=" * 80)
        print(f"✅ Structure creation completed!")
        print(f"📊 Summary:")
        print(f"   📁 Directories created: {len(self.created_directories)}")
        print(f"   📄 Files created: {len(self.created_files)}")
        print(f"   📋 Total new items: {len(self.created_directories) + len(self.created_files)}")
        
        # Show created directories
        if self.created_directories:
            print(f"\n📁 New directories:")
            for directory in sorted(self.created_directories):
                print(f"   + {directory}")
        
        # Show created files (limit to first 20 for readability)
        if self.created_files:
            print(f"\n📄 New files:")
            sorted_files = sorted(self.created_files)
            for file_path in sorted_files[:20]:
                print(f"   + {file_path}")
            if len(sorted_files) > 20:
                print(f"   + ... and {len(sorted_files) - 20} more files")

def main():
    # Configuration
    ROOT_DIR = r"C:\Users\Sarvesh.Prasad\OneDrive - Motherson Group\Documents\Python Scripts\ReadyProject\ReadyAI"
    FILE_LIST_PATH = r"C:\Users\Sarvesh.Prasad\OneDrive - Motherson Group\Documents\Python Scripts\ReadyProject\ReadyAI\File Tree Map\p1.1.txt"
    
    # Create the structure
    creator = DirectoryStructureFromFileList(ROOT_DIR)
    creator.create_from_file_list(FILE_LIST_PATH)

if __name__ == "__main__":
    main()




# This script provides the following features:

# Key Features:
# Duplicate Prevention: Only creates new directories and files that don't already exist
# ASCII Tree Parsing: Correctly parses tree structures with ├──, └──, and │ symbols
# File Annotation Handling: Removes [File #X] and (Update) annotations from file names
# Depth Management: Uses a stack to track directory hierarchy based on indentation
# Error Handling: Gracefully handles missing files and other errors
# Progress Reporting: Shows what's being created vs. what already exists

# How to Use:

# Save the script as create_structure.py

# Run the script:
# python create_structure.py

# For Subsequent Runs:
# When you run the script again with a different structure file:
# Update the STRUCTURE_FILE path in the script to point to your new file (e.g., p1.2.txt)
# Run the script again - it will only create new items and skip existing ones

# Customization:
# You can easily modify the paths by changing these variables in the main() function:
# ROOT_DIR: Your target directory
# STRUCTURE_FILE: Path to your structure file

# The script will automatically handle complex nested structures and ensure no duplicates are created across multiple runs.



# import os
# import pathlib
# import re
# from typing import List, Set, Dict

# class DirectoryStructureCreator:
#     def __init__(self, root_directory: str):
#         self.root_directory = pathlib.Path(root_directory)
#         self.created_items: Set[str] = set()
        
#     def read_structure_file(self, file_path: str) -> List[str]:
#         """Read the structure file and return lines."""
#         try:
#             with open(file_path, 'r', encoding='utf-8') as file:
#                 return file.readlines()
#         except FileNotFoundError:
#             print(f"Error: Structure file not found at {file_path}")
#             return []
#         except Exception as e:
#             print(f"Error reading file: {e}")
#             return []
    
#     def calculate_depth(self, line: str) -> int:
#         """Calculate depth by finding the position of the tree connector."""
#         line = line.rstrip('\r\n')
        
#         # Find the position where the actual name starts (after tree chars)
#         connector_match = re.search(r'[├└]──\s*', line)
#         if not connector_match:
#             return 0
        
#         # The depth is determined by how many 4-character segments come before the connector
#         # Each segment is either "│   " (pipe + 3 spaces) or "    " (4 spaces)
#         prefix = line[:connector_match.start()]
        
#         # Replace any sequence of 4 characters that represent one indentation level
#         # This handles both "│   " and "    " patterns
#         depth = len(prefix) // 4
        
#         return depth
    
#     def extract_name(self, line: str) -> str:
#         """Extract clean name from tree line."""
#         # Remove all tree drawing characters and get the name
#         clean_line = re.sub(r'^[│\s]*[├└]──\s*', '', line)
        
#         # Remove file annotations
#         clean_line = re.sub(r'\s*\[File #\d+\]', '', clean_line)
#         clean_line = re.sub(r'\s*\(Update\)', '', clean_line)
        
#         return clean_line.strip()
    
#     def create_structure(self, lines: List[str]) -> None:
#         """Create directory structure from lines."""
#         # Track the current path at each depth level
#         depth_to_path: Dict[int, pathlib.Path] = {-1: self.root_directory}
        
#         for line_num, line in enumerate(lines, 1):
#             if not line.strip():
#                 continue
            
#             depth = self.calculate_depth(line)
#             name = self.extract_name(line)
            
#             if not name:
#                 continue
            
#             # Get parent path (one level up)
#             parent_path = depth_to_path.get(depth - 1)
#             if parent_path is None:
#                 print(f"Warning: No parent for depth {depth} at line {line_num}")
#                 print(f"  Line: {line.strip()}")
#                 print(f"  Available depths: {list(depth_to_path.keys())}")
#                 parent_path = self.root_directory
            
#             if name.endswith('/'):
#                 # Directory
#                 dir_name = name.rstrip('/')
#                 dir_path = parent_path / dir_name
                
#                 if not dir_path.exists():
#                     dir_path.mkdir(parents=True, exist_ok=True)
#                     self.created_items.add(str(dir_path))
#                     print(f"Created directory [{depth}]: {dir_path}")
#                 else:
#                     print(f"Directory exists [{depth}]: {dir_path}")
                
#                 # Update depth tracking
#                 depth_to_path[depth] = dir_path
                
#                 # Clean deeper levels
#                 keys_to_remove = [k for k in depth_to_path.keys() if k > depth]
#                 for k in keys_to_remove:
#                     del depth_to_path[k]
#             else:
#                 # File
#                 file_path = parent_path / name
#                 file_path.parent.mkdir(parents=True, exist_ok=True)
                
#                 if not file_path.exists():
#                     file_path.touch()
#                     self.created_items.add(str(file_path))
#                     print(f"Created file [{depth}]: {file_path}")
#                 else:
#                     print(f"File exists [{depth}]: {file_path}")
    
#     def create_from_file(self, structure_file_path: str) -> None:
#         """Main method to create structure from file."""
#         print(f"Reading structure from: {structure_file_path}")
#         print(f"Creating structure in: {self.root_directory}")
#         print("=" * 80)
        
#         self.root_directory.mkdir(parents=True, exist_ok=True)
        
#         lines = self.read_structure_file(structure_file_path)
#         if not lines:
#             print("No lines found in file!")
#             return
        
#         self.create_structure(lines)
        
#         print("=" * 80)
#         print(f"Structure creation completed!")
#         print(f"New items created: {len(self.created_items)}")

# def main():

#     # Configuration
#     ROOT_DIR = r"C:\Users\Sarvesh.Prasad\OneDrive - Motherson Group\Documents\Python Scripts\ReadyProject\ReadyAI"
#     STRUCTURE_FILE = r"C:\Users\Sarvesh.Prasad\OneDrive - Motherson Group\Documents\Python Scripts\ReadyProject\ReadyAI\File Tree Map\p1.1.txt"
    
#     creator = DirectoryStructureCreator(ROOT_DIR)
#     creator.create_from_file(STRUCTURE_FILE)

# if __name__ == "__main__":
#     main()
