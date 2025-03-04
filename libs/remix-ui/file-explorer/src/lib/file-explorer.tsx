import React, { useEffect, useState, useRef } from 'react' // eslint-disable-line
// import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd' // eslint-disable-line
import { TreeView, TreeViewItem } from '@remix-ui/tree-view' // eslint-disable-line
import { ModalDialog } from '@remix-ui/modal-dialog' // eslint-disable-line
import { Toaster } from '@remix-ui/toaster' // eslint-disable-line
import * as async from 'async'
import Gists from 'gists'
import { FileExplorerMenu } from './file-explorer-menu' // eslint-disable-line
import { FileExplorerContextMenu } from './file-explorer-context-menu' // eslint-disable-line
import { FileExplorerProps, File } from './types'
import * as helper from '../../../../../apps/remix-ide/src/lib/helper'
import QueryParams from '../../../../../apps/remix-ide/src/lib/query-params'

import './css/file-explorer.css'

const queryParams = new QueryParams()

export const FileExplorer = (props: FileExplorerProps) => {
  const { filesProvider, name, registry, plugin, focusRoot, contextMenuItems, displayInput, externalUploads } = props
  const [state, setState] = useState({
    focusElement: [{
      key: name,
      type: 'folder'
    }],
    focusPath: null,
    files: [],
    fileManager: null,
    accessToken: null,
    ctrlKey: false,
    newFileName: '',
    actions: [],
    focusContext: {
      element: null,
      x: null,
      y: null
    },
    focusEdit: {
      element: null,
      type: '',
      isNew: false,
      lastEdit: ''
    },
    expandPath: [],
    modalOptions: {
      hide: true,
      title: '',
      message: '',
      ok: {
        label: 'Ok',
        fn: null
      },
      cancel: {
        label: 'Cancel',
        fn: null
      },
      handleHide: null
    },
    toasterMsg: ''
  })
  const editRef = useRef(null)

  useEffect(() => {
    if (state.focusEdit.element) {
      setTimeout(() => {
        if (editRef && editRef.current) {
          editRef.current.focus()
        }
      }, 150)
    }
  }, [state.focusEdit.element])

  useEffect(() => {
    (async () => {
      const fileManager = registry.get('filemanager').api
      const config = registry.get('config').api
      const accessToken = config.get('settings/gist-access-token')
      const files = await fetchDirectoryContent(name)
      const actions = [{
        id: 'newFile',
        name: 'New File',
        type: ['folder'],
        path: [],
        extension: [],
        pattern: []
      }, {
        id: 'newFolder',
        name: 'New Folder',
        type: ['folder'],
        path: [],
        extension: [],
        pattern: []
      }, {
        id: 'rename',
        name: 'Rename',
        type: ['file', 'folder'],
        path: [],
        extension: [],
        pattern: []
      }, {
        id: 'delete',
        name: 'Delete',
        type: ['file', 'folder'],
        path: [],
        extension: [],
        pattern: []
      }, {
        id: 'pushChangesToGist',
        name: 'Push changes to gist',
        type: [],
        path: [],
        extension: [],
        pattern: ['^browser/gists/([0-9]|[a-z])*$']
      }, {
        id: 'run',
        name: 'Run',
        type: [],
        path: [],
        extension: ['.js'],
        pattern: []
      }]

      setState(prevState => {
        return { ...prevState, fileManager, accessToken, files, actions }
      })
    })()
  }, [])

  useEffect(() => {
    if (state.fileManager) {
      filesProvider.event.register('fileExternallyChanged', fileExternallyChanged)
      filesProvider.event.register('fileRenamedError', fileRenamedError)
    }
  }, [state.fileManager])

  useEffect(() => {
    const { expandPath } = state
    const expandFn = async () => {
      let files = state.files

      for (let i = 0; i < expandPath.length; i++) {
        files = await resolveDirectory(expandPath[i], files)
        await setState(prevState => {
          return { ...prevState, files }
        })
      }
    }

    if (expandPath && expandPath.length > 0) {
      expandFn()
    }
  }, [state.expandPath])

  useEffect(() => {
    // unregister event to update state in callback
    if (filesProvider.event.registered.fileAdded) filesProvider.event.unregister('fileAdded', fileAdded)
    if (filesProvider.event.registered.folderAdded) filesProvider.event.unregister('folderAdded', folderAdded)
    if (filesProvider.event.registered.fileRemoved) filesProvider.event.unregister('fileRemoved', fileRemoved)
    if (filesProvider.event.registered.fileRenamed) filesProvider.event.unregister('fileRenamed', fileRenamed)
    filesProvider.event.register('fileAdded', fileAdded)
    filesProvider.event.register('folderAdded', folderAdded)
    filesProvider.event.register('fileRemoved', fileRemoved)
    filesProvider.event.register('fileRenamed', fileRenamed)
  }, [state.files])

  useEffect(() => {
    if (focusRoot) {
      setState(prevState => {
        return { ...prevState, focusElement: [{ key: name, type: 'folder' }] }
      })
      plugin.resetFocus(false)
    }
  }, [focusRoot])

  useEffect(() => {
    if (contextMenuItems) {
      setState(prevState => {
        // filter duplicate items
        const items = contextMenuItems.filter(({ name }) => prevState.actions.findIndex(action => action.name === name) === -1)

        return { ...prevState, actions: [...prevState.actions, ...items] }
      })
    }
  }, [contextMenuItems])

  useEffect(() => {
    if (displayInput) {
      handleNewFileInput()
      plugin.resetNewFile()
    }
  }, [displayInput])

  useEffect(() => {
    if (externalUploads) {
      uploadFile(externalUploads)
      plugin.resetUploadFile()
    }
  }, [externalUploads])

  const resolveDirectory = async (folderPath, dir: File[], isChild = false): Promise<File[]> => {
    if (!isChild && (state.focusEdit.element === 'browser/blank') && state.focusEdit.isNew && (dir.findIndex(({ path }) => path === 'browser/blank') === -1)) {
      dir = state.focusEdit.type === 'file' ? [...dir, {
        path: state.focusEdit.element,
        name: '',
        isDirectory: false
      }] : [{
        path: state.focusEdit.element,
        name: '',
        isDirectory: true
      }, ...dir]
    }
    dir = await Promise.all(dir.map(async (file) => {
      if (file.path === folderPath) {
        if ((extractParentFromKey(state.focusEdit.element) === folderPath) && state.focusEdit.isNew) {
          file.child = state.focusEdit.type === 'file' ? [...await fetchDirectoryContent(folderPath), {
            path: state.focusEdit.element,
            name: '',
            isDirectory: false
          }] : [{
            path: state.focusEdit.element,
            name: '',
            isDirectory: true
          }, ...await fetchDirectoryContent(folderPath)]
        } else {
          file.child = await fetchDirectoryContent(folderPath)
        }
        return file
      } else if (file.child) {
        file.child = await resolveDirectory(folderPath, file.child, true)
        return file
      } else {
        return file
      }
    }))

    return dir
  }

  const fetchDirectoryContent = async (folderPath: string): Promise<File[]> => {
    return new Promise((resolve) => {
      filesProvider.resolveDirectory(folderPath, (error, fileTree) => {
        if (error) console.error(error)
        const files = normalize(folderPath, fileTree)

        resolve(files)
      })
    })
  }

  const normalize = (path, filesList): File[] => {
    const folders = []
    const files = []
    const prefix = path.split('/')[0]

    Object.keys(filesList || {}).forEach(key => {
      const path = prefix + '/' + key

      if (filesList[key].isDirectory) {
        folders.push({
          path,
          name: extractNameFromKey(path),
          isDirectory: filesList[key].isDirectory
        })
      } else {
        files.push({
          path,
          name: extractNameFromKey(path),
          isDirectory: filesList[key].isDirectory
        })
      }
    })

    return [...folders, ...files]
  }

  const extractNameFromKey = (key: string):string => {
    const keyPath = key.split('/')

    return keyPath[keyPath.length - 1]
  }

  const extractParentFromKey = (key: string):string => {
    if (!key) return
    const keyPath = key.split('/')
    keyPath.pop()

    return keyPath.join('/')
  }

  const createNewFile = (newFilePath: string) => {
    const fileManager = state.fileManager

    helper.createNonClashingName(newFilePath, filesProvider, async (error, newName) => {
      if (error) {
        modal('Create File Failed', error, {
          label: 'Close',
          fn: async () => {}
        }, null)
      } else {
        const createFile = await fileManager.writeFile(newName, '')

        if (!createFile) {
          return toast('Failed to create file ' + newName)
        } else {
          await fileManager.open(newName)
          setState(prevState => {
            return { ...prevState, focusElement: [{ key: newName, type: 'file' }] }
          })
        }
      }
    })
  }

  const createNewFolder = async (newFolderPath: string) => {
    const fileManager = state.fileManager
    const dirName = newFolderPath + '/'

    try {
      const exists = await fileManager.exists(dirName)

      if (exists) return
      await fileManager.mkdir(dirName)
      setState(prevState => {
        return { ...prevState, focusElement: [{ key: newFolderPath, type: 'folder' }] }
      })
    } catch (e) {
      console.log('error: ', e)
      toast('Failed to create folder: ' + newFolderPath)
    }
  }

  const deletePath = async (path: string) => {
    if (filesProvider.isReadOnly(path)) {
      return toast('cannot delete file. ' + name + ' is a read only explorer')
    }
    const isDir = state.fileManager.isDirectory(path)

    modal(`Delete ${isDir ? 'folder' : 'file'}`, `Are you sure you want to delete ${path} ${isDir ? 'folder' : 'file'}?`, {
      label: 'Ok',
      fn: async () => {
        try {
          const fileManager = state.fileManager

          await fileManager.remove(path)
        } catch (e) {
          toast(`Failed to remove ${isDir ? 'folder' : 'file'} ${path}.`)
        }
      }
    }, {
      label: 'Cancel',
      fn: () => {}
    })
  }

  const renamePath = async (oldPath: string, newPath: string) => {
    try {
      const fileManager = state.fileManager
      const exists = await fileManager.exists(newPath)

      if (exists) {
        modal('Rename File Failed', 'File name already exists', {
          label: 'Close',
          fn: () => {}
        }, null)
      } else {
        await fileManager.rename(oldPath, newPath)
      }
    } catch (error) {
      modal('Rename File Failed', 'Unexpected error while renaming: ' + error, {
        label: 'Close',
        fn: async () => {}
      }, null)
    }
  }

  const removePath = (path: string, files: File[]): File[] => {
    return files.map(file => {
      if (file.path === path) {
        return null
      } else if (file.child) {
        const childFiles = removePath(path, file.child)

        file.child = childFiles.filter(file => file)
        return file
      } else {
        return file
      }
    })
  }

  const fileAdded = async (filePath: string) => {
    const pathArr = filePath.split('/')
    const expandPath = pathArr.map((path, index) => {
      return [...pathArr.slice(0, index)].join('/')
    }).filter(path => path && (path !== props.name))
    const files = await fetchDirectoryContent(props.name)

    setState(prevState => {
      const uniquePaths = [...new Set([...prevState.expandPath, ...expandPath])]

      return { ...prevState, files, expandPath: uniquePaths }
    })
    if (filePath.includes('_test.sol')) {
      plugin.event.trigger('newTestFileCreated', [filePath])
    }
  }

  const folderAdded = async (folderPath: string) => {
    const pathArr = folderPath.split('/')
    const expandPath = pathArr.map((path, index) => {
      return [...pathArr.slice(0, index)].join('/')
    }).filter(path => path && (path !== props.name))
    const files = await fetchDirectoryContent(props.name)

    setState(prevState => {
      const uniquePaths = [...new Set([...prevState.expandPath, ...expandPath])]

      return { ...prevState, files, expandPath: uniquePaths }
    })
  }

  const fileExternallyChanged = (path: string, file: { content: string }) => {
    const config = registry.get('config').api

    if (config.get('currentFile') === path && registry.editor.currentContent() && registry.editor.currentContent() !== file.content) {
      if (filesProvider.isReadOnly(path)) return registry.editor.setText(file.content)
      modal(path + ' changed', 'This file has been changed outside of Remix IDE.', {
        label: 'Replace by the new content',
        fn: () => {
          registry.editor.setText(file.content)
        }
      }, {
        label: 'Keep the content displayed in Remix',
        fn: () => {}
      })
    }
  }

  const fileRemoved = (filePath) => {
    const files = removePath(filePath, state.files)
    const updatedFiles = files.filter(file => file)

    setState(prevState => {
      return { ...prevState, files: updatedFiles }
    })
  }

  const fileRenamed = async () => {
    const files = await fetchDirectoryContent(props.name)

    setState(prevState => {
      return { ...prevState, files, expandPath: [...prevState.expandPath] }
    })
  }

  // register to event of the file provider
  // files.event.register('fileRenamed', fileRenamed)
  const fileRenamedError = (error: string) => {
    modal('File Renamed Failed', error, {
      label: 'Close',
      fn: () => {}
    }, null)
  }

  const uploadFile = (target) => {
    // TODO The file explorer is merely a view on the current state of
    // the files module. Please ask the user here if they want to overwrite
    // a file and then just use `files.add`. The file explorer will
    // pick that up via the 'fileAdded' event from the files module.

    [...target.files].forEach((file) => {
      const loadFile = (name: string): void => {
        const fileReader = new FileReader()

        fileReader.onload = async function (event) {
          if (helper.checkSpecialChars(file.name)) {
            modal('File Upload Failed', 'Special characters are not allowed', {
              label: 'Close',
              fn: async () => {}
            }, null)
            return
          }
          const success = await filesProvider.set(name, event.target.result)

          if (!success) {
            modal('File Upload Failed', 'Failed to create file ' + name, {
              label: 'Close',
              fn: async () => {}
            }, null)
          }
        }
        fileReader.readAsText(file)
      }
      const name = filesProvider.type + '/' + file.name

      filesProvider.exists(name, (error, exist) => {
        if (error) console.log(error)
        if (!exist) {
          loadFile(name)
        } else {
          modal('Confirm overwrite', `The file ${name} already exists! Would you like to overwrite it?`, {
            label: 'Ok',
            fn: () => {
              loadFile(name)
            }
          }, {
            label: 'Cancel',
            fn: () => {}
          })
        }
      })
    })
  }

  const publishToGist = () => {
    modal('Create a public gist', 'Are you sure you want to publish all your files in browser directory anonymously as a public gist on github.com? Note: this will not include directories.', {
      label: 'Ok',
      fn: toGist
    }, {
      label: 'Cancel',
      fn: () => {}
    })
  }

  const toGist = (id?: string) => {
    const proccedResult = function (error, data) {
      if (error) {
        modal('Publish to gist Failed', 'Failed to manage gist: ' + error, {
          label: 'Close',
          fn: async () => {}
        }, null)
      } else {
        if (data.html_url) {
          modal('Gist is ready', `The gist is at ${data.html_url}. Would you like to open it in a new window?`, {
            label: 'Ok',
            fn: () => {
              window.open(data.html_url, '_blank')
            }
          }, {
            label: 'Cancel',
            fn: () => {}
          })
        } else {
          modal('Publish to gist Failed', data.message + ' ' + data.documentation_url + ' ' + JSON.stringify(data.errors, null, '\t'), {
            label: 'Close',
            fn: async () => {}
          }, null)
        }
      }
    }

    /**
       * This function is to get the original content of given gist
       * @params id is the gist id to fetch
       */
    const getOriginalFiles = async (id) => {
      if (!id) {
        return []
      }

      const url = `https://api.github.com/gists/${id}`
      const res = await fetch(url)
      const data = await res.json()
      return data.files || []
    }

    // If 'id' is not defined, it is not a gist update but a creation so we have to take the files from the browser explorer.
    const folder = id ? 'browser/gists/' + id : 'browser/'

    packageFiles(filesProvider, folder, async (error, packaged) => {
      if (error) {
        console.log(error)
        modal('Publish to gist Failed', 'Failed to create gist: ' + error.message, {
          label: 'Close',
          fn: async () => {}
        }, null)
      } else {
        // check for token
        if (!state.accessToken) {
          modal('Authorize Token', 'Remix requires an access token (which includes gists creation permission). Please go to the settings tab to create one.', {
            label: 'Close',
            fn: async () => {}
          }, null)
        } else {
          const description = 'Created using remix-ide: Realtime Ethereum Contract Compiler and Runtime. \n Load this file by pasting this gists URL or ID at https://remix.ethereum.org/#version=' +
            queryParams.get().version + '&optimize=' + queryParams.get().optimize + '&runs=' + queryParams.get().runs + '&gist='
          const gists = new Gists({ token: state.accessToken })

          if (id) {
            const originalFileList = await getOriginalFiles(id)
            // Telling the GIST API to remove files
            const updatedFileList = Object.keys(packaged)
            const allItems = Object.keys(originalFileList)
              .filter(fileName => updatedFileList.indexOf(fileName) === -1)
              .reduce((acc, deleteFileName) => ({
                ...acc,
                [deleteFileName]: null
              }), originalFileList)
            // adding new files
            updatedFileList.forEach((file) => {
              const _items = file.split('/')
              const _fileName = _items[_items.length - 1]
              allItems[_fileName] = packaged[file]
            })

            toast('Saving gist (' + id + ') ...')
            gists.edit({
              description: description,
              public: true,
              files: allItems,
              id: id
            }, (error, result) => {
              proccedResult(error, result)
              if (!error) {
                for (const key in allItems) {
                  if (allItems[key] === null) delete allItems[key]
                }
              }
            })
          } else {
            // id is not existing, need to create a new gist
            toast('Creating a new gist ...')
            gists.create({
              description: description,
              public: true,
              files: packaged
            }, (error, result) => {
              proccedResult(error, result)
            })
          }
        }
      }
    })
  }

  const runScript = async (path: string) => {
    filesProvider.get(path, (error, content: string) => {
      if (error) return console.log(error)
      plugin.call('scriptRunner', 'execute', content)
    })
  }

  const emitContextMenuEvent = (id: string, path: string) => {
    plugin.emit(id, path)
  }

  const handleHideModal = () => {
    setState(prevState => {
      return { ...prevState, modalOptions: { ...state.modalOptions, hide: true } }
    })
  }

  const modal = (title: string, message: string, ok: { label: string, fn: () => void }, cancel: { label: string, fn: () => void }) => {
    setState(prevState => {
      return {
        ...prevState,
        modalOptions: {
          ...prevState.modalOptions,
          hide: false,
          message,
          title,
          ok,
          cancel,
          handleHide: handleHideModal
        }
      }
    })
  }

  const toast = (message: string) => {
    setState(prevState => {
      return { ...prevState, toasterMsg: message }
    })
  }

  const handleClickFile = (path: string) => {
    state.fileManager.open(path)
    setState(prevState => {
      return { ...prevState, focusElement: [{ key: path, type: 'file' }] }
    })
  }

  const handleClickFolder = async (path: string) => {
    if (state.ctrlKey) {
      if (state.focusElement.findIndex(item => item.key === path) !== -1) {
        setState(prevState => {
          return { ...prevState, focusElement: [...prevState.focusElement.filter(item => item.key !== path)] }
        })
      } else {
        setState(prevState => {
          return { ...prevState, focusElement: [...prevState.focusElement, { key: path, type: 'folder' }] }
        })
      }
    } else {
      let expandPath = []

      if (!state.expandPath.includes(path)) {
        expandPath = [...new Set([...state.expandPath, path])]
      } else {
        expandPath = [...new Set(state.expandPath.filter(key => key && (typeof key === 'string') && !key.startsWith(path)))]
      }

      setState(prevState => {
        return { ...prevState, focusElement: [{ key: path, type: 'folder' }], expandPath }
      })
    }
  }

  const handleContextMenuFile = (pageX: number, pageY: number, path: string, content: string) => {
    if (!content) return
    setState(prevState => {
      return { ...prevState, focusContext: { element: path, x: pageX, y: pageY }, focusEdit: { ...prevState.focusEdit, lastEdit: content } }
    })
  }

  const handleContextMenuFolder = (pageX: number, pageY: number, path: string, content: string) => {
    if (!content) return
    setState(prevState => {
      return { ...prevState, focusContext: { element: path, x: pageX, y: pageY }, focusEdit: { ...prevState.focusEdit, lastEdit: content } }
    })
  }

  const hideContextMenu = () => {
    setState(prevState => {
      return { ...prevState, focusContext: { element: null, x: 0, y: 0 } }
    })
  }

  const editModeOn = (path: string, type: string, isNew: boolean = false) => {
    if (filesProvider.isReadOnly(path)) return
    setState(prevState => {
      return { ...prevState, focusEdit: { ...prevState.focusEdit, element: path, isNew, type } }
    })
  }

  const editModeOff = async (content: string) => {
    if (typeof content === 'string') content = content.trim()
    const parentFolder = extractParentFromKey(state.focusEdit.element)

    if (!content || (content.trim() === '')) {
      if (state.focusEdit.isNew) {
        const files = removePath(state.focusEdit.element, state.files)
        const updatedFiles = files.filter(file => file)

        setState(prevState => {
          return { ...prevState, files: updatedFiles, focusEdit: { element: null, isNew: false, type: '', lastEdit: '' } }
        })
      } else {
        editRef.current.textContent = state.focusEdit.lastEdit
        setState(prevState => {
          return { ...prevState, focusEdit: { element: null, isNew: false, type: '', lastEdit: '' } }
        })
      }
    } else {
      if (state.focusEdit.lastEdit === content) {
        editRef.current.textContent = content
        return setState(prevState => {
          return { ...prevState, focusEdit: { element: null, isNew: false, type: '', lastEdit: '' } }
        })
      }
      if (helper.checkSpecialChars(content)) {
        modal('Validation Error', 'Special characters are not allowed', {
          label: 'Ok',
          fn: () => {}
        }, null)
      } else {
        if (state.focusEdit.isNew) {
          state.focusEdit.type === 'file' ? createNewFile(parentFolder + '/' + content) : createNewFolder(parentFolder + '/' + content)
          const files = removePath(state.focusEdit.element, state.files)
          const updatedFiles = files.filter(file => file)

          setState(prevState => {
            return { ...prevState, files: updatedFiles }
          })
        } else {
          const oldPath: string = state.focusEdit.element
          const oldName = extractNameFromKey(oldPath)
          const newPath = oldPath.replace(oldName, content)

          editRef.current.textContent = extractNameFromKey(oldPath)
          renamePath(oldPath, newPath)
        }
        setState(prevState => {
          return { ...prevState, focusEdit: { element: null, isNew: false, type: '', lastEdit: '' } }
        })
      }
    }
  }

  const handleNewFileInput = async (parentFolder?: string) => {
    if (!parentFolder) parentFolder = state.focusElement[0] ? state.focusElement[0].type === 'folder' ? state.focusElement[0].key : extractParentFromKey(state.focusElement[0].key) : name
    const expandPath = [...new Set([...state.expandPath, parentFolder])]

    setState(prevState => {
      return { ...prevState, expandPath }
    })
    editModeOn(parentFolder + '/blank', 'file', true)
  }

  const handleNewFolderInput = async (parentFolder?: string) => {
    if (!parentFolder) parentFolder = state.focusElement[0] ? state.focusElement[0].type === 'folder' ? state.focusElement[0].key : extractParentFromKey(state.focusElement[0].key) : name
    else if ((parentFolder.indexOf('.sol') !== -1) || (parentFolder.indexOf('.js') !== -1)) parentFolder = extractParentFromKey(parentFolder)
    const expandPath = [...new Set([...state.expandPath, parentFolder])]

    setState(prevState => {
      return { ...prevState, expandPath }
    })
    editModeOn(parentFolder + '/blank', 'folder', true)
  }

  const handleEditInput = (event) => {
    if (event.which === 13) {
      event.preventDefault()
      editModeOff(editRef.current.innerText)
    }
  }

  const label = (file: File) => {
    return (
      <div
        className='remixui_items d-inline-block w-100'
        ref={state.focusEdit.element === file.path ? editRef : null}
        suppressContentEditableWarning={true}
        contentEditable={state.focusEdit.element === file.path}
        onKeyDown={handleEditInput}
        onBlur={(e) => {
          e.stopPropagation()
          editModeOff(editRef.current.innerText)
        }}
      >
        <span
          title={file.path}
          className={'remixui_label ' + (file.isDirectory ? 'folder' : 'remixui_leaf')}
          data-path={file.path}
        >
          { file.name }
        </span>
      </div>
    )
  }

  const renderFiles = (file: File, index: number) => {
    if (file.isDirectory) {
      return (
        <div key={index}>
          <TreeViewItem
            id={`treeViewItem${file.path}`}
            iconX='pr-3 fa fa-folder'
            iconY='pr-3 fa fa-folder-open'
            key={`${file.path + index}`}
            label={label(file)}
            onClick={(e) => {
              e.stopPropagation()
              if (state.focusEdit.element !== file.path) handleClickFolder(file.path)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleContextMenuFolder(e.pageX, e.pageY, file.path, e.target.textContent)
            }}
            labelClass={ state.focusEdit.element === file.path ? 'bg-light' : state.focusElement.findIndex(item => item.key === file.path) !== -1 ? 'bg-secondary' : '' }
            controlBehaviour={ state.ctrlKey }
            expand={state.expandPath.includes(file.path)}
          >
            {
              file.child ? <TreeView id={`treeView${file.path}`} key={index}>{
                file.child.map((file, index) => {
                  return renderFiles(file, index)
                })
              }
              </TreeView> : <TreeView id={`treeView${file.path}`} key={index} />
            }
          </TreeViewItem>
          { ((state.focusContext.element === file.path) && (state.focusEdit.element !== file.path)) &&
            <FileExplorerContextMenu
              actions={state.actions}
              hideContextMenu={hideContextMenu}
              createNewFile={handleNewFileInput}
              createNewFolder={handleNewFolderInput}
              deletePath={deletePath}
              renamePath={editModeOn}
              publishToGist={publishToGist}
              emit={emitContextMenuEvent}
              pageX={state.focusContext.x}
              pageY={state.focusContext.y}
              path={file.path}
              type='folder'
            />
          }
        </div>
      )
    } else {
      return (
        <div key={index}>
          <TreeViewItem
            id={`treeViewItem${file.path}`}
            key={index}
            label={label(file)}
            onClick={(e) => {
              e.stopPropagation()
              if (state.focusEdit.element !== file.path) handleClickFile(file.path)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleContextMenuFile(e.pageX, e.pageY, file.path, e.target.textContent)
            }}
            icon='far fa-file'
            labelClass={ state.focusEdit.element === file.path ? 'bg-light' : state.focusElement.findIndex(item => item.key === file.path) !== -1 ? 'bg-secondary' : '' }
          />
          { ((state.focusContext.element === file.path) && (state.focusEdit.element !== file.path)) &&
            <FileExplorerContextMenu
              actions={state.actions}
              hideContextMenu={hideContextMenu}
              createNewFile={handleNewFileInput}
              createNewFolder={handleNewFolderInput}
              deletePath={deletePath}
              renamePath={editModeOn}
              runScript={runScript}
              emit={emitContextMenuEvent}
              pageX={state.focusContext.x}
              pageY={state.focusContext.y}
              path={file.path}
              type='file'
            />
          }
        </div>
      )
    }
  }

  return (
    <div>
      <TreeView id='treeView'>
        <TreeViewItem id="treeViewItem"
          label={
            <FileExplorerMenu
              title={name}
              menuItems={props.menuItems}
              createNewFile={handleNewFileInput}
              createNewFolder={handleNewFolderInput}
              publishToGist={publishToGist}
              uploadFile={uploadFile}
              fileManager={state.fileManager}
            />
          }
          expand={true}>
          <div className='pb-2'>
            <TreeView id='treeViewMenu'>
              {
                state.files.map((file, index) => {
                  return renderFiles(file, index)
                })
              }
            </TreeView>
          </div>
        </TreeViewItem>
      </TreeView>
      {
        props.name && <ModalDialog
          id={ props.name }
          title={ state.modalOptions.title }
          message={ state.modalOptions.message }
          hide={ state.modalOptions.hide }
          ok={ state.modalOptions.ok }
          cancel={ state.modalOptions.cancel }
          handleHide={ handleHideModal }
        />
      }
      <Toaster message={state.toasterMsg} />
    </div>
  )
}

export default FileExplorer

function packageFiles (filesProvider, directory, callback) {
  const ret = {}
  filesProvider.resolveDirectory(directory, (error, files) => {
    if (error) callback(error)
    else {
      async.eachSeries(Object.keys(files), (path, cb) => {
        if (filesProvider.isDirectory(path)) {
          cb()
        } else {
          filesProvider.get(path, (error, content) => {
            if (error) return cb(error)
            if (/^\s+$/.test(content) || !content.length) {
              content = '// this line is added to create a gist. Empty file is not allowed.'
            }
            ret[path] = { content }
            cb()
          })
        }
      }, (error) => {
        callback(error, ret)
      })
    }
  })
}
