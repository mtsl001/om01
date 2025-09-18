import os
import pathlib
import re
from typing import List, Set

class DirectoryStructureCreator:
    def __init__(self, root_directory: str):
        self.root_directory = pathlib.Path(root_directory)
        self.created_items: Set[str] = set()
        
    def read_structure_file(self, file_path: str) -> List[str]:
        """Read the structure file and return lines."""
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                return file.readlines()
        except FileNotFoundError:
            print(f"Error: Structure file not found at {file_path}")
            return []
        except Exception as e:
            print(f"Error reading file: {e}")
            return []
    
    def clean_line(self, line: str) -> tuple[str, int]:
        """Clean a line and return the item name and its indent level."""
        # Remove carriage returns and newlines
        line = line.rstrip('\r\n')
        
        # Count the depth by counting tree characters
        original_line = line
        
        # Remove tree drawing characters and count depth
        depth = 0
        clean_name = line
        
        # Remove tree symbols: │, ├──, └──, spaces
        clean_name = re.sub(r'^[│\s]*[├└]──\s*', '', clean_name)
        clean_name = re.sub(r'^[│\s]*', '', clean_name)
        
        # Calculate depth from original line structure
        tree_chars = re.findall(r'[│├└]', original_line)
        if tree_chars:
            # Count the number of tree segments
            segments = original_line.split('├──') + original_line.split('└──')
            depth = len([s for s in segments if '│' in s or s.strip() == ''])
            if '├──' in original_line or '└──' in original_line:
                depth = original_line.count('│') + (1 if ('├──' in original_line or '└──' in original_line) else 0)
        
        # Remove file annotations like [File #1], (Update), etc.
        clean_name = re.sub(r'\s*\[File #\d+\]', '', clean_name)
        clean_name = re.sub(r'\s*\(Update\)', '', clean_name)
        clean_name = clean_name.strip()
        
        return clean_name, depth
    
    def create_structure(self, lines: List[str]) -> None:
        """Create the directory structure from parsed lines."""
        path_stack = [self.root_directory]
        
        for line in lines:
            if not line.strip():
                continue
                
            item_name, depth = self.clean_line(line)
            if not item_name:
                continue
            
            # Adjust path stack based on depth
            while len(path_stack) > depth + 1:
                path_stack.pop()
            
            # Ensure we have a base path
            if not path_stack:
                path_stack = [self.root_directory]
            
            current_path = path_stack[-1]
            
            if item_name.endswith('/'):
                # It's a directory
                dir_name = item_name.rstrip('/')
                new_dir_path = current_path / dir_name
                
                # Create directory if it doesn't exist
                if not new_dir_path.exists():
                    new_dir_path.mkdir(parents=True, exist_ok=True)
                    self.created_items.add(str(new_dir_path))
                    print(f"Created directory: {new_dir_path}")
                else:
                    print(f"Directory already exists: {new_dir_path}")
                
                # Update path stack
                if len(path_stack) <= depth + 1:
                    path_stack.append(new_dir_path)
                else:
                    path_stack[depth + 1] = new_dir_path
                    
            else:
                # It's a file
                file_path = current_path / item_name
                
                # Create parent directories if they don't exist
                file_path.parent.mkdir(parents=True, exist_ok=True)
                
                # Create file if it doesn't exist
                if not file_path.exists():
                    file_path.touch()
                    self.created_items.add(str(file_path))
                    print(f"Created file: {file_path}")
                else:
                    print(f"File already exists: {file_path}")
    
    def create_from_file(self, structure_file_path: str) -> None:
        """Main method to create structure from file."""
        print(f"Reading structure from: {structure_file_path}")
        print(f"Creating structure in: {self.root_directory}")
        
        # Ensure root directory exists
        self.root_directory.mkdir(parents=True, exist_ok=True)
        
        # Read and process the structure file
        lines = self.read_structure_file(structure_file_path)
        if not lines:
            return
        
        # Create the structure
        self.create_structure(lines)
        
        print(f"\nStructure creation completed!")
        print(f"Total new items created: {len(self.created_items)}")

def main():
    # Configuration
    ROOT_DIR = r"C:\Users\SarvIO Group\Documents\Python Scripts\ReadyProject\ReadyAI"
    STRUCTURE_FILE = r"C:\Users\SarvIO Group\Documents\Python Scripts\ReadyProject\ReadyAI\File Tree Map\p1.1.txt"
    
    # Create the structure
    creator = DirectoryStructureCreator(ROOT_DIR)
    creator.create_from_file(STRUCTURE_FILE)

if __name__ == "__main__":
    main()
