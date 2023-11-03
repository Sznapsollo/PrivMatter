import { useState, useEffect } from 'react'
import { Form, Button } from 'react-bootstrap'
import { useTranslation } from 'react-i18next'
import CryptoJS from 'crypto-js';
import { AppState } from '../context/Context'
import ConfirmationComp from './ConfirmationComp';
import SecretComp from './SecretComp';
import { AlertData } from '../model';
import { AiOutlineLoading } from 'react-icons/ai';
import '../styles.css'

const NoteComp = () => {

    const { t } = useTranslation();
    interface SecretMeta {
        info?: string,
        warning?: string
    }

    const { mainState, mainDispatch, settingsState } = AppState();
    const [filePath, setFilePath] = useState<string>('');
    const [fileName, setFileName] = useState<string>('');
    const [rawNote, setRawNote] = useState<string>('');
    const [note, setNote] = useState<string>('');
    const [orgNote, setOrgNote] = useState<string>('');
    const [isDirty, setIsDirty] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isEncrypted, setIsEncrypted] = useState<boolean>(false);
    const [showUnsaved, setShowUnsaved] = useState<boolean>(false);
    const [needSecret, setNeedSecret] = useState<boolean>(false);
    const [askRefresh, setAskRefresh] = useState<boolean>(false);
    const [needSecretMeta, setNeedSecretMeta] = useState<SecretMeta>({});
    const [isSavingAsEncrypted, setIsSavingAsEncryted] = useState<boolean>(false);
    
    useEffect(() => {
        if(rawNote?.length) {
            decryptData();
        }
    }, [rawNote]);

    const initializeEditedItem = () => {
        setInitialState();
        let defaultFileName = (new Date().toJSON().slice(0,10).replace(/-/g,'_') + '_privmatter.txt');
        setFilePath(mainState.editedItem.path || '');
        setFileName(mainState.editedItem.name || defaultFileName);
        if(mainState.editedItem.fetchData === true) {
            // NJ load and setEncrypted data
            setIsLoading(true);
            const requestOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({type: 'retrieveFileFromPath', data: mainState.editedItem.path}) 
            };

            fetch('actions', requestOptions)
            .then(result => {
                if(!result.ok) {
                    throw new Error('Network response was not ok.');
                }
                return result.json()
            })
            .then(data => {
                setIsLoading(false);
                if(data.status !== 0) {
                    // console.warn("Actions response", data);
                    return
                }
                if(typeof data.data === "string") {
                    setRawNote(data.data);
                }
            })
            .catch(function(error) {
                setIsLoading(false);
                console.warn('Fetch operation error: ', error.message);
            });
        } else if(mainState.editedItem.rawNote) {
            setIsLoading(true);
            setRawNote(mainState.editedItem.rawNote);
            setIsLoading(false);
        }
    }

    useEffect(() => {
        if(isEncrypted) {
            if(!mainState.secret) {
                giveMeSecret("", "");
            } else {
                dismissSecret();
                decryptData();
            }
        }
    }, [mainState.secret]);

    useEffect(() => {
        // console.log('changed edited item', mainState.editedItem)
        initializeEditedItem();
    }, [mainState.editedItem]);

    useEffect(() => {
        // NJ to check if there is something open to ask if we should save first
        // console.log('changed editedItemCandidate item candidate', mainState.editedItemCandidate)
        if(isDirty) {
            setShowUnsaved(true);
        } else {
            if(mainState.secret && settingsState.forgetSecretMode === "IMMEDIATE") {
                mainDispatch({type: 'CLEAR_SECRET'})     
            }
            mainDispatch({type: 'SET_EDITED_ITEM', payload: mainState.editedItemCandidate}) 
        }
    }, [mainState.editedItemCandidate]);

    useEffect(() => {
        validateButtonsState();
    }, [note]);

    const giveMeSecret = (info?:string, warning?: string):void => {
        setNeedSecretMeta({info: info, warning: warning});
        setNeedSecret(true);
    }

    const dismissSecret = ():void => {
        setNeedSecretMeta({});
        setNeedSecret(false);
    }

    const validateButtonsState = () => {
        setIsDirty((note !== orgNote));
    }

    const setInitialState = () => {
        setFileName('');
        setFilePath('');
        setIsEncrypted(false);
        setIsSavingAsEncryted(false);
        dismissSecret();
        setNote('');
        setOrgNote('');
        setRawNote('');
        setShowUnsaved(false);
    }

    const handleSecretSubmit = (secret: string) => {
        mainDispatch({type: 'UPDATE_SECRET', payload: secret});
    }

    const handleSaveAsSecretSubmit = (secret: string) => {
        if(secret) {
            saveToFileEncrypted(secret);
        }
        setIsSavingAsEncryted(false);
    }

    const saveToFileEncrypted = (secret: string) => {
        let fileNameLoc = fileName.replaceAll('.txt', '') + '.prvmttr';
        saveToFile(fileNameLoc, encryptData(secret));
    }

    const saveToFile = (fileNameLoc: string, fileData: string) => {
        const blob = new Blob([fileData], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = fileNameLoc;
        link.href = url;

        setAskRefresh(true);
        
        link.click();
    }

    const updateFile = () => {
        if(!mainState.editedItem.path || !mainState.editedItem.fetchData) {
            return
        }

        const fileData = isEncrypted ? encryptData(mainState.secret) : note;
        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({type: 'updateFileFromPath', data: fileData, path: mainState.editedItem.path}) 
        };
        
        fetch('actions', requestOptions)
        .then(result => {return result.json()})
        .then(data => {
            if(data.status !== 0) {
                // console.warn("Actions response", data);
                mainDispatch({type: 'SHOW_ALERT_MODAL', payload: {show: true, header: "Error!", message: t("somethingWentWrong")} as AlertData})
                return
            }
            mainDispatch({type: "UPDATE_ITEMS_LIST"});
            initializeEditedItem();
            mainDispatch({type: 'SHOW_NOTIFICATION', payload: {show: true, closeAfter: 5000, message: t('dataSaved')} as AlertData})
        })
    }

    const encryptData = (secret: string):string => {
        const encryptedData = CryptoJS.AES.encrypt(
            JSON.stringify(note),
            secret
        ).toString();

        return 'privmatterencrypted_' + encryptedData;
    };

    const decryptData = () => {
        let data;
        let rawData = rawNote;
        let encrypted = false;
        try {
            encrypted = false;
            if(fileName?.toLocaleLowerCase()?.includes('.prvmttr')) {
                encrypted = true;
            }
            if(rawData.startsWith('privmatterencrypted_')) {
                encrypted = true;
                rawData = rawData.replace('privmatterencrypted_', '');
            }

            if(encrypted === true) {
                setIsEncrypted(true);

                if(!mainState.secret) {
                    giveMeSecret("", "");
                    return
                }

                const bytes = CryptoJS.AES.decrypt(rawData, mainState.secret);
                data = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
            } else {
                data = rawData;
            }
        } catch(e) {
            if(encrypted) {
                giveMeSecret("", t("incorrectPassword"));
            }
        }
        if(data && data.length) {
            setNote(data);
            setOrgNote(data);
        }
    };

    return (
        <div className='noteContainer'>
            {
                isLoading &&
                <div style={{width: "100%", height: "100%", display: "table"}}>
                    <div style={{display: "table-cell", verticalAlign: "middle", textAlign: 'center'}}>
                        <AiOutlineLoading className='h2 loading-icon'/> &nbsp;In progress ...
                    </div>
                </div>
            }
            {
                isSavingAsEncrypted && 
                <SecretComp confirm={true} info={t("providePasswordToEncryptFile")} handleSubmit={handleSaveAsSecretSubmit} />
            }
            {
                needSecret && 
                <SecretComp confirm={false} warning={needSecretMeta.warning} info={needSecretMeta.info || t("providePasswordToOpenDecryptedFile")} handleSubmit={handleSecretSubmit} />
            }
            {
                !isLoading && !needSecret && !isSavingAsEncrypted && <div style={{display: 'flex', flexDirection: 'column', flex: 1}}>
                    <div className='formGroupContainer'>
                        <Form.Group className='formGroup'>
                        <label className='upperLabel'>{t("filePath")}</label>
                        <Form.Control
                            type="text"
                            name="filePath"
                            placeholder=''
                            value={filePath}
                            readOnly={true}
                        ></Form.Control>
                        </Form.Group>
                    </div>
                    <div className='formGroupContainer'>
                        <Form.Group className='formGroup'>
                        <label className='upperLabel'>{t("fileName")}</label>
                        <Form.Control
                            type="text"
                            name="fileName"
                            placeholder=''
                            value={fileName}
                            readOnly={true}
                        ></Form.Control>
                        </Form.Group>
                    </div>
                    <div className='formGroupContainer flexStretch'>
                        <Form.Group className='formGroup'>
                            <label className='upperLabel'>{t("note")}</label>
                            <Form.Control
                                as="textarea"
                                name="comments"
                                value={note}
                                onChange={(e) => {
                                    setNote(e.target.value);
                                }}
                            ></Form.Control>
                        </Form.Group>
                    </div>
                    <div style={{display: "flex"}} className='formGroupContainer'>
                        {
                            mainState.editedItem.fetchData && <Button disabled={!isDirty} variant='success' onClick={ () => {
                                updateFile();
                            }}
                            title={t("saveToLocation") + ' ' + mainState.editedItem.path}>{t("save")}</Button>
                        }
                        <div style={{flex: 1}}>&nbsp;</div>
                        &nbsp;
                        <Button disabled={!isDirty} variant='primary' onClick={ () => {
                            setIsSavingAsEncryted(true);
                        }}
                        title={t("encryptAndSaveToLocation")}>{t("saveAsEncrypted")}</Button>
                        &nbsp;
                        <Button disabled={!isDirty} variant='success' onClick={ () => {
                            saveToFile(fileName, note);
                        }}
                        title={t("saveToSelectedLocation")}>{t("saveAs")}</Button>
                        &nbsp;
                        <Button disabled={!isDirty} variant='danger' onClick={() => {
                            setNote(orgNote);
                        }}
                        title={t("rollbackItemChanges")}>{t("cancel")}</Button>
                    </div>
                </div>
            }
            {   
                showUnsaved && 
                <ConfirmationComp 
                    externalHeading={t("warning")}
                    externalContent={t("unsavedChanges")}
                    externalSaveLabel={t("ignoreUnsaved")}
                    externalCloseLabel={t("correctUnsaved")}
                    handleExternalSave={() => {
                        setShowUnsaved(false);
                        if(mainState.editedItemCandidate) {
                            if(mainState.secret && settingsState.forgetSecretMode === "IMMEDIATE") {
                                mainDispatch({type: 'CLEAR_SECRET'})     
                            }
                            mainDispatch({type: 'SET_EDITED_ITEM', payload: mainState.editedItemCandidate});
                        }
                    }}
                    handleExternalClose={() => {setShowUnsaved(false)}}
                />
            }
            {   
                askRefresh && 
                <ConfirmationComp 
                    externalHeading={t("question")}
                    externalContent={t("confirmRefresh")}
                    externalSaveLabel={t("Yes")}
                    externalCloseLabel={t("No")}
                    handleExternalSave={() => {
                        setAskRefresh(false);
                        mainDispatch({type: "UPDATE_ITEMS_LIST"});
                        initializeEditedItem();
                    }}
                    handleExternalClose={() => {setAskRefresh(false)}}
                />
            }
        </div>
    )
}

export default NoteComp
